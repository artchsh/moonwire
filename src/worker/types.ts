import type { Env, AppConfig } from "./config";
import type { AppDatabase } from "./db/client";
import type { Scope } from "../shared/api";

/** The authenticated principal attached to a request after auth middleware. */
export interface Principal {
  kind: "admin" | "agent";
  scope: Scope; // admin is always "write"
  /** admin id or agent token id */
  id: string;
  username?: string;
}

export interface HonoEnv {
  Bindings: Env;
  Variables: {
    db: AppDatabase;
    config: AppConfig;
    /** Present only after an auth middleware has run and succeeded. */
    principal?: Principal;
  };
}
