import { resolve } from "node:path";
import { defineVitestConfig } from "@nuxt/test-utils/config";

const projectRoot = resolve(import.meta.dirname, "../..");

export default defineVitestConfig({
  test: {
    name: "nuxt",
    root: projectRoot,
    environment: "nuxt",
    include: ["tests/nuxt/**/*.test.ts"],
    silent: "passed-only",
    hookTimeout: 30_000,
  },
});
