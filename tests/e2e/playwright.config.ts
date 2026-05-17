import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const globalSetupPath = resolve(import.meta.dirname, "global-setup.ts");

export default defineConfig({
  testDir: import.meta.dirname,
  globalSetup: globalSetupPath,
  use: {
    screenshot: "only-on-failure",
  },
  // Each worker gets its own DB and server (see fixtures.ts).
  // Playwright defaults workers to roughly half the CPU count.
  // Override with --workers=N on the CLI if needed.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
