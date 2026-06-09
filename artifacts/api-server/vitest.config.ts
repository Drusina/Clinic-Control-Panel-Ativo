import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Integration tests share a single PostgreSQL connection pool; run them
    // serially so seed/cleanup of one file can't race another.
    fileParallelism: false,
  },
});
