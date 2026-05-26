/**
 * Starts a self-contained demo server so you can manually test HLS
 * pinch-to-zoom in a browser.
 *
 * - Creates a fresh test database (auto-migrated on server startup)
 * - Starts the local fixture file server (HLS playlist + video)
 * - Starts the Nuxt production server on PORT (default 3001)
 * - Seeds one HLS media item via the test API
 * - Prints the URL to open in a browser
 *
 * Usage:
 *   npx tsx tests/e2e/start-demo-server.ts
 *   PORT=3002 npx tsx tests/e2e/start-demo-server.ts
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  cacheDir,
  ensureHlsFixtures,
  ensureTestVideo,
  startFileServer,
} from "../shared/media-fixtures.js";

const projectRoot = resolve(import.meta.dirname, "../..");

loadEnv({ path: resolve(projectRoot, ".env") });

const baseDbUrl = process.env.DATABASE_URL;
if (!baseDbUrl) throw new Error("DATABASE_URL is not set");

const port = Number(process.env.PORT ?? 3001);

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

async function waitForServer(url: string, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const apiRes = await fetch(`${url}/api/tasks`);
      if (apiRes.status !== 200) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const pageRes = await fetch(`${url}/media/grid`);
      if (pageRes.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

// Ensure fixture files are generated.
ensureTestVideo();
ensureHlsFixtures();

const runId = randomUUID().replace(/-/g, "").slice(0, 12);
const dbName = `media_cache_demo_${runId}`;
const adminUrl = withDatabase(baseDbUrl, "postgres");
const demoDbUrl = withDatabase(baseDbUrl, dbName);

// Create fresh DB and run migrations before starting the server.
// (nuxt-drizzle-migrations auto-migrates on startup but the server's
// startupRecovery promise initialises eagerly — if it runs before migrations
// it rejects, poisoning getTasks() for the entire process lifetime.)
console.log(`Creating demo database: ${dbName}`);
const adminClient = postgres(adminUrl, { max: 1 });
await adminClient.unsafe(`CREATE DATABASE "${dbName}"`);
await adminClient.end();

console.log("Running migrations…");
const migrationsFolder = resolve(projectRoot, "server/database/migrations");
const migrateClient = postgres(demoDbUrl, {
  max: 1,
  onnotice: (n) => {
    if (n.severity !== "NOTICE") console.warn(n);
  },
});
try {
  const db = drizzle(migrateClient);
  await migrate(db, { migrationsFolder });
} finally {
  await migrateClient.end();
}
console.log("Migrations complete.\n");

// Start fixture file server (serves HLS playlist + segments).
// Bind to 0.0.0.0 so the browser (on the client machine) can fetch media files.
const publicHost = process.env.PUBLIC_HOST ?? "192.168.1.56";
const fixtureServer = await startFileServer(cacheDir, {
  host: "0.0.0.0",
  publicHost,
});
const fixtureUrl = fixtureServer.url;
console.log(`Fixture server: ${fixtureUrl}`);

// Set up a minimal test-plugin dir so PLUGINS_DIR is satisfied.
const testPluginsDir = join(tmpdir(), `media-cache-demo-${runId}`);
mkdirSync(join(testPluginsDir, "node_modules", "test-plugin"), {
  recursive: true,
});
writeFileSync(
  join(testPluginsDir, "package.json"),
  JSON.stringify(
    {
      name: "media-cache-demo-plugins",
      type: "module",
      dependencies: { "test-plugin": "1.0.0" },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(testPluginsDir, "node_modules", "test-plugin", "package.json"),
  JSON.stringify(
    {
      name: "test-plugin",
      version: "1.0.0",
      type: "module",
      main: "index.js",
    },
    null,
    2,
  ),
);
writeFileSync(
  join(testPluginsDir, "node_modules", "test-plugin", "index.js"),
  `export { default } from ${JSON.stringify(resolve(projectRoot, "tests/unit/fixtures/test-plugin.ts"))};\n`,
);

// Start the Nuxt production server.
const outputDir = resolve(projectRoot, ".output");
const serverProcess = spawn(
  "node",
  ["--import", "tsx/esm", join(outputDir, "server/index.mjs")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: demoDbUrl,
      PORT: String(port),
      HOST: "0.0.0.0",
      ENABLE_TEST_API: "true",
      PLUGINS_DIR: testPluginsDir,
      TEST_FIXTURE_SERVER_URL: fixtureUrl,
    },
    stdio: "inherit",
  },
);

const serverUrl = `http://127.0.0.1:${port}`;
const publicUrl = `http://192.168.1.56:${port}`;

serverProcess.on("error", (err) => {
  console.error("Server process error:", err);
});

console.log(`Waiting for server at ${serverUrl}…`);
await waitForServer(serverUrl);
console.log("Server ready!\n");

// Seed an HLS media item via the test API.
const hlsMedia = {
  liaseSource: "test-source",
  id: "demo-hls-1",
  files: [
    {
      type: "main",
      url: `${fixtureUrl}/hls/playlist.m3u8`,
      video: true,
      audio: false,
      image: false,
      ext: "m3u8",
      width: 320,
      height: 240,
    },
  ],
};

const setupRes = await fetch(`${serverUrl}/api/_test/setup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ media: [[hlsMedia]], delay: 0 }),
});
if (!setupRes.ok) {
  console.error("Setup failed:", await setupRes.text());
  process.exit(1);
}

// Create a query using the test-source plugin.
const createQueryRes = await fetch(`${serverUrl}/api/admin/queries`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "HLS Demo Query",
    schedule: 0,
    requestOptions: { source: "test-source", queryType: "test-handler" },
  }),
});
if (!createQueryRes.ok) {
  console.error("Query creation failed:", await createQueryRes.text());
  process.exit(1);
}
const { id: queryId } = (await createQueryRes.json()) as { id: number };

// Run the query.
const runQueryRes = await fetch(
  `${serverUrl}/api/admin/queries/${queryId}/run`,
  { method: "POST" },
);
if (!runQueryRes.ok) {
  console.error("Query run failed:", await runQueryRes.text());
  process.exit(1);
}

// Wait for query execution to complete.
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const tasksRes = await fetch(`${serverUrl}/api/tasks`);
  if (!tasksRes.ok) break;
  const tasks = ((await tasksRes.json()) as { json: Array<{ status: string }> })
    .json;
  if (tasks.every((t) => t.status !== "running")) break;
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n✓ HLS demo server running at: ${publicUrl}/media/feed`);
console.log("  Open the URL above to test pinch-to-zoom on HLS video.");
console.log("  Press Ctrl+C to stop.\n");

// Clean up on exit.
async function cleanup() {
  console.log("\nShutting down…");
  serverProcess.kill("SIGTERM");
  fixtureServer.close();
  const cleanupClient = postgres(adminUrl, { max: 1 });
  try {
    await cleanupClient.unsafe(
      `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`,
    );
  } finally {
    await cleanupClient.end();
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
