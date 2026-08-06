import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Pure server/domain logic runs in node; React component tests run in jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["tests/client/**", "jsdom"]],
    setupFiles: ["tests/client/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/client/**/*.test.tsx"],
  },
});
