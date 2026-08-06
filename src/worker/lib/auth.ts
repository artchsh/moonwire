import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { ApiError } from "./errors";
import { schema } from "../db/client";
import type { HonoEnv, Principal } from "../types";

export const SESSION_COOKIE = "mw_session";

const encoder = new TextEncoder();
// The Workers runtime caps PBKDF2 at 100k iterations, so this is the ceiling.
// The iteration count is stored in each hash, so it can be raised later if the
// platform limit changes (verify honours whatever a stored hash used).
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN = 32; // bytes

// ---- base64 helpers (Workers has btoa/atob) ----

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- password hashing (PBKDF2-SHA256 via WebCrypto; argon2 has no WASM-free
//      Workers build, and PBKDF2 with a high iteration count is FIPS-approved) ----

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number.parseInt(parts[2]!, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = base64ToBytes(parts[3]!);
  const expected = base64ToBytes(parts[4]!);
  const actual = await deriveBits(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---- opaque token / session helpers ----

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as base64url (43 chars). */
export function randomToken(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Agent token: `mw_` + 43 base64url chars, shown once. Returns plaintext + hash. */
export async function createAgentTokenSecret(): Promise<{ plaintext: string; hash: string }> {
  const plaintext = `mw_${randomToken(32)}`;
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash };
}

// ---- session cookie ----

export function issueSessionCookie(c: Context<HonoEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    secure: c.var.config.cookieSecure,
    maxAge: Math.floor(c.var.config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(c: Context<HonoEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// ---- principal resolution + authorization middleware ----

/** Resolve the caller, preferring an admin session cookie over a bearer token. */
export async function resolvePrincipal(
  c: Context<HonoEnv>,
): Promise<Principal | undefined> {
  const db = c.var.db;
  const now = Date.now();

  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie) {
    const sessionId = await sha256Hex(cookie);
    const rows = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.id, sessionId))
      .limit(1);
    const s = rows[0];
    if (s && s.expiresAt > now) {
      const admins = await db
        .select()
        .from(schema.admin)
        .where(eq(schema.admin.id, s.adminId))
        .limit(1);
      const a = admins[0];
      if (a) return { kind: "admin", scope: "write", id: a.id, username: a.username };
    }
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const hash = await sha256Hex(token);
      const rows = await db
        .select()
        .from(schema.agentToken)
        .where(eq(schema.agentToken.tokenHash, hash))
        .limit(1);
      const t = rows[0];
      if (t) {
        await db
          .update(schema.agentToken)
          .set({ lastUsedAt: now })
          .where(eq(schema.agentToken.id, t.id));
        return { kind: "agent", scope: t.scope, id: t.id };
      }
    }
  }

  return undefined;
}

/** Reject cookie-authenticated mutations whose Origin is not allow-listed. */
export function enforceOrigin(c: Context<HonoEnv>): void {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  // Bearer (agent) requests do not carry cookies, so CSRF does not apply.
  if (c.req.header("Authorization")?.startsWith("Bearer ")) return;
  const origin = c.req.header("Origin");
  if (!origin || !c.var.config.allowedOrigins.includes(origin)) {
    throw new ApiError("FORBIDDEN", "Cross-origin request rejected");
  }
}

async function authenticate(c: Context<HonoEnv>): Promise<Principal> {
  const principal = await resolvePrincipal(c);
  if (!principal) throw new ApiError("UNAUTHENTICATED", "Authentication required");
  return principal;
}

/** Any authenticated caller (read or write scope). */
export const requireRead: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set("principal", await authenticate(c));
  await next();
};

/** Authenticated caller with write scope; enforces origin for cookie auth. */
export const requireWrite: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const principal = await authenticate(c);
  if (principal.scope !== "write") {
    throw new ApiError("FORBIDDEN", "This token is read-only");
  }
  enforceOrigin(c);
  c.set("principal", principal);
  await next();
};

/** Administrator session only (agents can never reach admin routes). */
export const requireAdmin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const principal = await authenticate(c);
  if (principal.kind !== "admin") {
    throw new ApiError("FORBIDDEN", "Administrator access required");
  }
  enforceOrigin(c);
  c.set("principal", principal);
  await next();
};
