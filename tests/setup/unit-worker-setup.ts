/**
 * Vitest setupFile — runs once per test FILE (because Vitest re-evaluates
 * setupFiles for every file when `isolate: true`, the default for pool:"forks").
 *
 * Creates a fresh PostgreSQL database for this file by copying the migrated
 * template DB created in global-setup.ts, then overrides DATABASE_URL so that
 * the `db` singleton in server/utils/drizzle.ts (which is evaluated after this
 * setupFile) connects to the per-file database.
 *
 * Cleanup is handled by the globalSetup teardown, which drops all databases
 * matching the run-scoped prefix once all tests finish.
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { vi } from "vitest";

// Inject the TypeScript test plugin into loadInstalledPlugins so all unit
// tests that use getLiase/getLiaseQuery get the test-source plugin without
// needing the LIASE_PLUGINS env var.
vi.mock("@@/server/lib/liase/plugin-manager", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@@/server/lib/liase/plugin-manager")>();
  const { default: testPlugin } = await import("../unit/fixtures/test-plugin");
  return {
    ...original,
    loadInstalledPlugins: vi.fn().mockResolvedValue([testPlugin]),
  };
});

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

const currentUrl = process.env.DATABASE_URL;
if (!currentUrl) throw new Error("DATABASE_URL is not set in test worker");

const runId = process.env.TEST_RUN_ID;
if (!runId)
  throw new Error("TEST_RUN_ID is not set — globalSetup may not have run");

const templateDbName = process.env.TEST_TEMPLATE_DB;
if (!templateDbName)
  throw new Error("TEST_TEMPLATE_DB is not set — globalSetup may not have run");

// Unique name for this test file's database. withDatabase() replaces the
// pathname so the host/port/credentials from currentUrl are preserved even
// if currentUrl already points to a previous file's database (because
// process.env is shared across files within the same worker process).
const fileDbName = `media_cache_test_${runId}_f${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const adminUrl = withDatabase(currentUrl, "postgres");
const fileDbUrl = withDatabase(currentUrl, fileDbName);

const adminClient = postgres(adminUrl, { max: 1 });
await adminClient.unsafe(
  `CREATE DATABASE "${fileDbName}" TEMPLATE "${templateDbName}"`,
);
await adminClient.end();

// Must be set before the test file's modules are imported so that the `db`
// singleton in server/utils/drizzle.ts picks up the correct URL.
process.env.DATABASE_URL = fileDbUrl;
