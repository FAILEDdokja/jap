/**
 * Vitest configuration for the backend.
 *
 * This file exists so the runner resolves its config HERE. Without it Vitest
 * walks up the tree and loads the frontend's `/vite.config.ts`, which imports
 * `@vitejs/plugin-react` and `vite` — packages the backend does not (and must
 * not) depend on. The backend suite is pure Node: no DOM, no browser, no
 * database (the API is exercised through `inject()` against the in-memory demo
 * stores).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The demo stores (sessions, patients, consents, audit trail) are module
    // state. Isolating files keeps one suite's writes out of another's.
    isolate: true,
    globals: false,
  },
});
