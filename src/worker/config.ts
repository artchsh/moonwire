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
  COOKIE_SECURE?: string;
  MAX_UPLOAD_BYTES?: string;
  MAX_ATTACHMENTS_PER_CARD?: string;
}

export interface AppConfig {
  sessionSecret: string;
  /** Origins accepted on cookie-authenticated mutations (CSRF defense). */
  allowedOrigins: string[];
  cookieSecure: boolean;
  maxUploadBytes: number;
  maxAttachmentsPerCard: number;
  sessionTtlMs: number;
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

  const allowedOrigins = new Set<string>();
  if (env.APP_ORIGIN) {
    for (const origin of env.APP_ORIGIN.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) allowedOrigins.add(trimmed);
    }
  }
  // Vite dev server origin, convenient for local development.
  allowedOrigins.add("http://localhost:5173");

  return {
    sessionSecret,
    allowedOrigins: [...allowedOrigins],
    cookieSecure: env.COOKIE_SECURE === "true",
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
