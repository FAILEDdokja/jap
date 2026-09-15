import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The Postgres integration suite starts a real embedded server.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
