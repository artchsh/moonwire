import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { requireRead, requireAdmin } from "../../lib/auth";
import { buildExport, storageInfo } from "./export";
import { restore } from "./restore";
import { buildOpenApi } from "./openapi";

// Mounted at /api/v1
export const operationsRouter = new Hono<HonoEnv>();

operationsRouter.get("/export", requireRead, async (c) => {
  return c.json(await buildExport(c.var.db));
});

operationsRouter.post("/restore", requireAdmin, async (c) => {
  const summary = await restore(c.var.db, c.env.UPLOADS, await c.req.json());
  return c.json({ restored: summary });
});

operationsRouter.get("/storage", requireRead, async (c) => {
  return c.json(await storageInfo(c.var.db));
});

// Mounted at / (root)
export const docsRouter = new Hono<HonoEnv>();

docsRouter.get("/openapi.json", (c) => c.json(buildOpenApi()));

docsRouter.get("/docs", (c) => {
  return c.html(DOCS_HTML);
});

const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Moonwire API</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
