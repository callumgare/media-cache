import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

const projectRoot = resolve(import.meta.dirname, "../..");

export default defineConfig({
  test: {
    root: projectRoot,
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    include: ["tests/unit/**/*.test.ts"],
    globalSetup: [resolve(import.meta.dirname, "../setup/global-setup.ts")],
    // unit-worker-setup.ts runs before each test file (Vitest re-evaluates
    // setupFiles per file with isolate:true). It creates a per-file DB from the
    // migrated template and overrides DATABASE_URL before db.ts is imported.
    setupFiles: [resolve(import.meta.dirname, "../setup/unit-worker-setup.ts")],
    env: {
      LIASE_PLUGINS: resolve(import.meta.dirname, "./fixtures/test-plugin.ts"),
    },
    pool: "forks",
    fileParallelism: true,
    silent: "passed-only",
  },
  resolve: {
    // Default here: https://nuxt.com/docs/4.x/api/nuxt-config#alias
    alias: {
      "@": resolve(import.meta.dirname, "../../app"),
      "~": resolve(import.meta.dirname, "../../app"),
      "@@": projectRoot,
      "~~": projectRoot,
    },
  },
});
