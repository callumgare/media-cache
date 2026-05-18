import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./tests/unit/vitest.config.ts",
      "./tests/nuxt/vitest.config.ts",
    ],
    silent: "passed-only",
  },
});
