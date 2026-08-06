import { eq } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { schema } from "../../db/client";
import { createId } from "../../lib/ids";
import { ApiError } from "../../lib/errors";
import {
  hashPassword,
  verifyPassword,
  sha256Hex,
  randomToken,
  createAgentTokenSecret,
} from "../../lib/auth";
import type {
  AgentTokenDto,
  CreatedAgentTokenDto,
  Scope,
} from "../../../shared/api";

export async function isSetupComplete(db: AppDatabase): Promise<boolean> {
  const rows = await db.select({ id: schema.admin.id }).from(schema.admin).limit(1);
  return rows.length > 0;
}

/** First-run setup: allowed exactly once. */
export async function createAdmin(
  db: AppDatabase,
  username: string,
  password: string,
): Promise<void> {
  if (await isSetupComplete(db)) {
    throw new ApiError("SETUP_ALREADY_COMPLETE", "Setup has already been completed");
  }
  const now = Date.now();
  await db.insert(schema.admin).values({
    id: createId("adm"),
    username,
    passwordHash: await hashPassword(password),
    createdAt: now,
  });
}

/** Verify credentials; returns the admin id or null (constant-ish time). */
export async function verifyLogin(
  db: AppDatabase,
  username: string,
  password: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.admin)
    .where(eq(schema.admin.username, username))
    .limit(1);
  const admin = rows[0];
  if (!admin) {
    // Perform a dummy hash to reduce username-enumeration timing signal.
    await verifyPassword(password, "pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return null;
  }
  const ok = await verifyPassword(password, admin.passwordHash);
  return ok ? admin.id : null;
}

/** Create a server-side session; returns the opaque cookie token. */
export async function createSession(
  db: AppDatabase,
  adminId: string,
  ttlMs: number,
): Promise<string> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const now = Date.now();
  await db.insert(schema.session).values({
    id,
    adminId,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
  return token;
}

export async function destroySession(db: AppDatabase, cookieToken: string): Promise<void> {
  const id = await sha256Hex(cookieToken);
  await db.delete(schema.session).where(eq(schema.session.id, id));
}

export async function listTokens(db: AppDatabase): Promise<AgentTokenDto[]> {
  const rows = await db.select().from(schema.agentToken);
  return rows
    .map(toTokenDto)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createToken(
  db: AppDatabase,
  name: string,
  scope: Scope,
): Promise<CreatedAgentTokenDto> {
  const { plaintext, hash } = await createAgentTokenSecret();
  const now = Date.now();
  const id = createId("tok");
  await db.insert(schema.agentToken).values({
    id,
    name,
    tokenHash: hash,
    scope,
    createdAt: now,
    lastUsedAt: null,
  });
  return { id, name, scope, createdAt: now, lastUsedAt: null, token: plaintext };
}

export async function deleteToken(db: AppDatabase, id: string): Promise<void> {
  const result = await db.delete(schema.agentToken).where(eq(schema.agentToken.id, id));
  if (!result.meta.changes) throw ApiError.notFound("Token");
}

function toTokenDto(row: typeof schema.agentToken.$inferSelect): AgentTokenDto {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}
