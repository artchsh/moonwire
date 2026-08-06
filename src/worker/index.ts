import { buildApp } from "./app";
import type { Env } from "./config";

const app = buildApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API, health, and docs are handled by the Hono app.
    if (
      path.startsWith("/api/") ||
      path === "/health" ||
      path === "/openapi.json" ||
      path === "/docs"
    ) {
      return app.fetch(request, env, ctx);
    }

    // Everything else is the React single-page app served from static assets.
    // not_found_handling: "single-page-application" returns index.html for
    // client-side routes.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
