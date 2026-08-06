import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { HonoEnv } from "./types";
import { loadConfig } from "./config";
import { openDatabase } from "./db/client";
import { handleError } from "./lib/errors";
import { authRouter } from "./modules/auth/routes";
import { boardsRouter } from "./modules/boards/routes";
import { attachmentsRouter } from "./modules/attachments/routes";
import { operationsRouter, docsRouter } from "./modules/operations/routes";

export function buildApp() {
  const app = new Hono<HonoEnv>();

  app.onError(handleError);

  // Attach a Drizzle client to every request.
  app.use("*", async (c, next) => {
    c.set("db", openDatabase(c.env.DB));
    await next();
  });

  // Health does not depend on configuration, so it works even before
  // SESSION_SECRET is set — useful for container/orchestrator probes.
  app.get("/health", async (c) => {
    try {
      await c.var.db.run(sql`SELECT 1`);
      return c.json({ status: "ok", database: "ok" });
    } catch (err) {
      console.error("Health check failed:", err);
      return c.json({ status: "error", database: "error" }, 503);
    }
  });

  // Everything under /api requires valid configuration.
  app.use("/api/*", async (c, next) => {
    c.set("config", loadConfig(c.env));
    await next();
  });

  // Operator documentation (served at the root).
  app.route("/", docsRouter);

  // Versioned public API.
  app.route("/api/v1", authRouter);
  app.route("/api/v1", boardsRouter);
  app.route("/api/v1", attachmentsRouter);
  app.route("/api/v1", operationsRouter);

  return app;
}
