import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const runTestServerPath = resolve(import.meta.dirname, "run-test-server.sh");

// Find free port to use for the test server. The port is persisted in
// process.env so that worker processes (which re-evaluate this file) reuse the
// same value that the main process already bound the server to.
if (!process.env.WEB_SERVER_BASE_URL) {
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
  process.env.WEB_SERVER_BASE_URL = `http://127.0.0.1:${port}`;
}
const webServerURL = process.env.WEB_SERVER_BASE_URL;

console.log(`Test web server will be available at: ${webServerURL}`);

export default defineConfig({
  testDir: import.meta.dirname,
  use: {
    baseURL: webServerURL,
    screenshot: "only-on-failure",
  },
  // Run tests serially — they share a DB
  workers: 1,
  webServer: {
    command: runTestServerPath,
    url: webServerURL,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: process.env.CI ? "pipe" : "ignore",
    env: {
      PORT: String(new URL(webServerURL).port),
      HOST: new URL(webServerURL).hostname,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
