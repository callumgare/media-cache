/**
 * Playwright global setup — runs once before any workers start.
 *
 * 1. Builds the Nuxt app (set SKIP_BUILD=true to reuse an existing build).
 * 2. Creates a migrated PostgreSQL template database that each worker will
 *    copy from.
 * 3. Returns a teardown function that drops all databases created for this run.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FullConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  type FileServer,
  cacheDir,
  ensureHlsFixtures,
  ensureTestVideo,
  startFileServer,
} from "../shared/media-fixtures";

const projectRoot = resolve(import.meta.dirname, "../..");
const e2eRoot = import.meta.dirname;
const migrationsFolder = resolve(projectRoot, "server/database/migrations");

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

export default async function globalSetup(_config: FullConfig) {
  // Load .env so DATABASE_URL is available (no-op if already set in the environment)
  loadEnv({ path: resolve(projectRoot, ".env") });

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is not set");

  // Build the Nuxt app so workers can start a fast production server.
  // Each run builds into its own temp directory so parallel runs don't conflict.
  // Override with SKIP_BUILD=true to reuse an existing build from .output.
  const timestamp = new Date()
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .replace(".", "-")
    .slice(0, 23);
  if (!process.env.SKIP_BUILD) {
    mkdirSync(join(e2eRoot, ".builds"), { recursive: true });
    mkdirSync(join(e2eRoot, ".results"), { recursive: true });
  }
  const buildCacheTmpDir = process.env.SKIP_BUILD
    ? null
    : join(e2eRoot, ".builds", timestamp);
  const outputTmpDir = process.env.SKIP_BUILD
    ? null
    : join(e2eRoot, ".results", timestamp);
  if (buildCacheTmpDir) mkdirSync(buildCacheTmpDir);
  if (outputTmpDir) mkdirSync(outputTmpDir);
  process.env.TEST_SERVER_OUTPUT_DIR = outputTmpDir
    ? join(outputTmpDir, ".output")
    : resolve(projectRoot, ".output");

  console.log(
    `[e2e] Server output dir: ${process.env.TEST_SERVER_OUTPUT_DIR}\n`,
  );

  if (buildCacheTmpDir && outputTmpDir) {
    // Seed the temp .nuxt dir with the project's existing build cache to avoid cold starts.
    // Exclude dist/ — that's the compiled app output and causes Nuxt to skip the Vite/Nitro
    // build step entirely, so nothing ever gets written to NITRO_OUTPUT_DIR.
    const sourceDotNuxt = resolve(projectRoot, ".nuxt");
    const destDotNuxt = join(buildCacheTmpDir, ".nuxt");
    if (existsSync(sourceDotNuxt)) {
      cpSync(sourceDotNuxt, destDotNuxt, {
        recursive: true,
        filter: (src) => !src.startsWith(resolve(sourceDotNuxt, "dist")),
      });
    }

    console.log("\n[e2e] Building Nuxt app (set SKIP_BUILD=true to skip)...\n");
    const buildStart = Date.now();
    try {
      execSync("npx nuxt build", {
        cwd: projectRoot,
        stdio: "pipe",
        env: {
          ...process.env,
          NUXT_BUILD_DIR: join(buildCacheTmpDir, ".nuxt"),
          NITRO_OUTPUT_DIR: join(outputTmpDir, ".output"),
        },
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "stdout" in err)
        process.stdout.write((err as { stdout: Buffer }).stdout);
      if (err && typeof err === "object" && "stderr" in err)
        process.stderr.write((err as { stderr: Buffer }).stderr);
      throw new Error("[e2e] Nuxt build failed");
    }
    console.log(
      `\n[e2e] Build completed in ${((Date.now() - buildStart) / 1000).toFixed(1)}s\n`,
    );
  }

  // Ensure test fixture files exist, then serve them over local HTTP so
  // tests can reference videos and HLS playlists without hitting external networks.
  ensureTestVideo();
  ensureHlsFixtures();
  const fixtureServer: FileServer = await startFileServer(cacheDir);
  process.env.TEST_FIXTURE_SERVER_URL = fixtureServer.url;

  // Create the template database and apply all migrations.
  const runId = randomUUID().replace(/-/g, "").slice(0, 16);
  const templateDbName = `media_cache_test_${runId}_tmpl`;

  // These are inherited by worker processes spawned after globalSetup.
  process.env.TEST_RUN_ID = runId;
  process.env.TEST_TEMPLATE_DB = templateDbName;

  const adminUrl = withDatabase(baseUrl, "postgres");
  const adminClient = postgres(adminUrl, { max: 1 });
  try {
    await adminClient.unsafe(`CREATE DATABASE "${templateDbName}"`);
  } finally {
    await adminClient.end();
  }

  const migrateClient = postgres(withDatabase(baseUrl, templateDbName), {
    max: 1,
    onnotice: (notice) => {
      if (notice.severity !== "NOTICE") console.warn(notice);
    },
  });
  try {
    const db = drizzle(migrateClient);
    await migrate(db, { migrationsFolder });
  } finally {
    await migrateClient.end();
  }

  // Teardown: drop every database created for this run and clean up the build temp dir.
  return async () => {
    fixtureServer.close();
    // Clean up the intermediate build cache but leave the output dir in place
    // so it can be inspected for debugging if tests failed.
    if (buildCacheTmpDir) {
      try {
        rmSync(buildCacheTmpDir, { recursive: true, force: true });
      } catch {
        // non-fatal
      }
    }
    const cleanupClient = postgres(adminUrl, { max: 1 });
    try {
      const dbs = await cleanupClient<{ datname: string }[]>`
        SELECT datname FROM pg_database
        WHERE datname LIKE ${`media_cache_test_${runId}_%`}
      `;
      for (const { datname } of dbs) {
        await cleanupClient.unsafe(
          `DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`,
        );
      }
    } finally {
      await cleanupClient.end();
    }
  };
}
