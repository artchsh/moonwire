import { defineConfig } from "drizzle-kit";

// `npm run db:generate` emits SQL migrations to ./migrations, which are applied
// to D1 with `wrangler d1 migrations apply moonwire`.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});
