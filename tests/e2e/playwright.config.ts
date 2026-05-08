import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const runTestServerPath = resolve(import.meta.dirname, "run-test-server.sh");

export default defineConfig({
  testDir: import.meta.dirname,
  use: {
    baseURL: "http://localhost:3001",
    screenshot: "only-on-failure",
  },
  // Run tests serially — they share a DB
  workers: 1,
  webServer: {
    command: runTestServerPath,
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
