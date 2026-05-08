import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

function toTestDbUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/media_cache_test";
  return parsed.toString();
}

const projectRoot = resolve(import.meta.dirname, "../..");

export default defineConfig({
  test: {
    root: projectRoot,
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    include: ["tests/unit/**/*.test.ts"],
    globalSetup: [resolve(import.meta.dirname, "../setup/global-setup.ts")],
    env: {
      DATABASE_URL: toTestDbUrl(process.env.DATABASE_URL ?? ""),
      MEDIA_FINDER_PLUGINS: resolve(
        import.meta.dirname,
        "./fixtures/test-plugin.ts",
      ),
    },
    pool: "forks",
    fileParallelism: false,
    onConsoleLog() {
      return false;
    },
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
