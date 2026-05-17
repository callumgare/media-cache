/**
 * Playwright custom fixtures providing per-worker database and server isolation.
 *
 * Each Playwright worker gets:
 * - Its own PostgreSQL database (copied from the migrated template).
 * - Its own Nuxt production server instance on a unique port.
 *
 * The built-in `baseURL` fixture is overridden per worker so that
 * `page.goto("/path")` and `request.post("/api/...")` automatically target the
 * correct server without any changes to test code.
 *
 * Import `test` and `expect` from this file instead of "@playwright/test".
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { test as base } from "@playwright/test";
import postgres from "postgres";

const projectRoot = resolve(import.meta.dirname, "../..");

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // First confirm the API layer is initialised (avoids 426 from WebSocket
      // routes that h3 registers before the full server is ready).
      const apiRes = await fetch(`${url}/api/tasks`);
      if (apiRes.status !== 200) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      // Then confirm SSR page rendering works – Vite compiles modules lazily,
      // so the first page request may fail with 500 until compilation finishes.
      const pageRes = await fetch(`${url}/media/grid`);
      if (pageRes.status < 500) return;
    } catch {
      // server not yet ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `[e2e] Server at ${url} did not become ready within ${timeoutMs}ms`,
  );
}

type WorkerFixtures = {
  workerBaseUrl: string;
  _serverLogBuffer: string[];
};

export const test = base.extend<
  // test-scoped: override the built-in baseURL so page/request use the worker's server
  { baseURL: string; _attachServerLogsOnFailure: undefined },
  WorkerFixtures
>({
  /**
   * Worker-scoped: starts a dedicated Nuxt production server backed by a
   * per-worker PostgreSQL database for the lifetime of the worker.
   */
  _serverLogBuffer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires object destructuring for the first argument
    async ({}, use) => {
      await use([]);
    },
    { scope: "worker" },
  ],

  workerBaseUrl: [
    async ({ _serverLogBuffer }, use) => {
      const baseUrl = process.env.DATABASE_URL;
      if (!baseUrl) throw new Error("[e2e] DATABASE_URL not set in worker");
      const runId = process.env.TEST_RUN_ID;
      if (!runId)
        throw new Error(
          "[e2e] TEST_RUN_ID not set — globalSetup may not have run",
        );
      const templateDbName = process.env.TEST_TEMPLATE_DB;
      if (!templateDbName)
        throw new Error(
          "[e2e] TEST_TEMPLATE_DB not set — globalSetup may not have run",
        );

      // Create a fresh database for this worker from the migrated template.
      const workerDbName = `media_cache_test_${runId}_w${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const adminUrl = withDatabase(baseUrl, "postgres");
      const workerDbUrl = withDatabase(baseUrl, workerDbName);

      const adminClient = postgres(adminUrl, { max: 1 });
      try {
        await adminClient.unsafe(
          `CREATE DATABASE "${workerDbName}" TEMPLATE "${templateDbName}"`,
        );
      } finally {
        await adminClient.end();
      }

      // Start the Nuxt production server on an available port.
      // tsx/esm is used as a loader so the server can dynamically import the
      // TypeScript test plugin specified by LIASE_PLUGINS at runtime.
      const port = await findFreePort();
      const serverUrl = `http://127.0.0.1:${port}`;

      const testPluginPath = resolve(
        import.meta.dirname,
        "../unit/fixtures/test-plugin.ts",
      );
      const sharedEnv = {
        ...process.env,
        DATABASE_URL: workerDbUrl,
        PORT: String(port),
        HOST: "127.0.0.1",
        ENABLE_TEST_API: "true",
        LIASE_PLUGINS: testPluginPath,
      };

      // Start the pre-built production server.
      // tsx/esm lets Nitro dynamically import the TypeScript test plugin.
      const outputDir =
        process.env.TEST_SERVER_OUTPUT_DIR ?? resolve(projectRoot, ".output");
      const serverProcess = spawn(
        "node",
        ["--import", "tsx/esm", join(outputDir, "server/index.mjs")],
        {
          cwd: projectRoot,
          env: sharedEnv,
          stdio: process.env.E2E_SERVER_LOGS ? "inherit" : "pipe",
        },
      );

      if (!process.env.E2E_SERVER_LOGS) {
        serverProcess.stdout?.on("data", (chunk: Buffer) =>
          _serverLogBuffer.push(chunk.toString()),
        );
        serverProcess.stderr?.on("data", (chunk: Buffer) =>
          _serverLogBuffer.push(chunk.toString()),
        );
      }

      try {
        await waitForServer(serverUrl);
        await use(serverUrl);
      } finally {
        serverProcess.kill("SIGTERM");

        // Drop the worker database. WITH (FORCE) terminates any residual
        // connections left by the server process.
        const cleanupClient = postgres(adminUrl, { max: 1 });
        try {
          await cleanupClient.unsafe(
            `DROP DATABASE IF EXISTS "${workerDbName}" WITH (FORCE)`,
          );
        } finally {
          await cleanupClient.end();
        }
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],

  /**
   * Override the built-in baseURL per worker so all page.goto() and
   * request.post() calls automatically target the worker's own server.
   */
  _attachServerLogsOnFailure: [
    async ({ _serverLogBuffer }, use, testInfo) => {
      await use(undefined);
      if (
        testInfo.status !== testInfo.expectedStatus &&
        _serverLogBuffer.length > 0
      ) {
        await testInfo.attach("server-logs", {
          body: _serverLogBuffer.join(""),
          contentType: "text/plain",
        });
      }
    },
    { auto: true },
  ],

  baseURL: async ({ workerBaseUrl }, use) => {
    await use(workerBaseUrl);
  },
});

export { expect } from "@playwright/test";
