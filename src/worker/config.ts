/**
 * Cloudflare bindings and typed configuration.
 *
 * Bindings (DB, UPLOADS, ASSETS) come from wrangler.jsonc. Plain vars and the
 * SESSION_SECRET secret arrive on `env`; `loadConfig` validates and coerces them.
 */
export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET?: string;
  APP_ORIGIN?: string;
  MAX_UPLOAD_BYTES?: string;
  MAX_ATTACHMENTS_PER_CARD?: string;
}

export interface AppConfig {
  sessionSecret: string;
  /**
   * Hosts (host[:port], scheme-agnostic) accepted on cookie-authenticated
   * mutations (CSRF defense). Host-based so it works under `wrangler dev` (which
   * emulates the custom-domain route over http) and in production (https) alike.
   */
  allowedHosts: string[];
  maxUploadBytes: number;
  maxAttachmentsPerCard: number;
  sessionTtlMs: number;
}

// Local dev hosts are always allowed. This does not weaken production CSRF: the
// session cookie is SameSite=Strict, scoped to the app's own domain, and Secure
// in production, so a localhost page can never attach it to a request against
// the deployed origin.
const LOCAL_HOSTS = [
  "localhost:8787",
  "127.0.0.1:8787",
  "localhost:5173",
  "127.0.0.1:5173",
];

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    // Bare host[:port] with no scheme.
    return value.includes("/") ? null : value;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadConfig(env: Env): AppConfig {
  const sessionSecret = env.SESSION_SECRET?.trim();
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error(
      "SESSION_SECRET is required and must be at least 16 characters. " +
        "Set it with: wrangler secret put SESSION_SECRET",
    );
  }

  const allowedHosts = new Set<string>(LOCAL_HOSTS);
  if (env.APP_ORIGIN) {
    for (const origin of env.APP_ORIGIN.split(",")) {
      const host = hostOf(origin.trim());
      if (host) allowedHosts.add(host);
    }
  }

  return {
    sessionSecret,
    allowedHosts: [...allowedHosts],
    maxUploadBytes: intVar(env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    maxAttachmentsPerCard: intVar(env.MAX_ATTACHMENTS_PER_CARD, 12),
    sessionTtlMs: 30 * DAY_MS,
  };
}

function intVar(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
