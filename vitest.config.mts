import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next's tsconfig keeps JSX as-is; tests compile it (PDF documents are TSX).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    environment: "node",
    // DB tests share one database; run files sequentially.
    fileParallelism: false,
  },
});
