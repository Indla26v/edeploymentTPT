import path from "node:path";
import { defineConfig } from "vitest/config";

/** `pnpm db:seed:demo`: runs scripts/demo/*.demo.ts, which build demo plans through the real Server Actions. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: { include: ["scripts/demo/**/*.demo.ts"], environment: "node", testTimeout: 300_000, hookTimeout: 300_000 },
});
