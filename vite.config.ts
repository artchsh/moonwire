import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React client is built to dist/client and served by the Worker as static assets.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    // Local `npm run dev` proxies API calls to `wrangler dev` on :8787.
    proxy: {
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
      "/openapi.json": "http://localhost:8787",
      "/docs": "http://localhost:8787",
    },
  },
});
