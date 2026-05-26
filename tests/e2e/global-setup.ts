/**
 * Playwright global setup — runs once before any workers start.
 *
 * 1. Builds the Nuxt app (set EXISTING_BUILD_DIR to reuse an existing build or build there).
 * 2. Creates a migrated PostgreSQL template database that each worker will
 *    copy from.
 * 3. Returns a teardown function that drops all databases created for this run.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  ensureTestImage,
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

  if (process.env.SKIP_BUILD) {
    throw new Error(
      "[e2e] SKIP_BUILD is no longer supported. Use EXISTING_BUILD_DIR instead — " +
        "point it to a directory: if it already contains a .output folder the build " +
        "will be reused, otherwise the app will be built there.",
    );
  }

  // Build the Nuxt app so workers can start a fast production server.
  // Set EXISTING_BUILD_DIR to a path to reuse an existing build (if .output exists
  // inside it) or to build into that specific directory.
  // Without EXISTING_BUILD_DIR, each run builds into its own temp directory so
  // parallel runs don't conflict.
  const timestamp = new Date()
    .toISOString()
    .replace("T", "_")
    .replace(/:/g, "-")
    .replace(".", "-")
    .slice(0, 23);

  const existingBuildDir = process.env.EXISTING_BUILD_DIR
    ? resolve(process.env.EXISTING_BUILD_DIR)
    : null;

  // buildCacheTmpDir holds the Nuxt build cache (.nuxt); only used for auto-named builds.
  // outputDir is where the compiled app (.output) lives.
  let buildCacheTmpDir: string | null = null;
  let outputDir: string;
  const skipBuild =
    existingBuildDir !== null && existsSync(join(existingBuildDir, ".output"));

  if (existingBuildDir) {
    outputDir = existingBuildDir;
  } else {
    mkdirSync(join(e2eRoot, ".builds"), { recursive: true });
    mkdirSync(join(e2eRoot, ".results"), { recursive: true });
    buildCacheTmpDir = join(e2eRoot, ".builds", timestamp);
    outputDir = join(e2eRoot, ".results", timestamp);
    mkdirSync(buildCacheTmpDir);
    mkdirSync(outputDir);
  }

  process.env.TEST_SERVER_OUTPUT_DIR = join(outputDir, ".output");

  console.log(
    `[e2e] Server output dir: ${process.env.TEST_SERVER_OUTPUT_DIR}\n`,
  );

  if (!skipBuild) {
    const nuxtBuildDir = buildCacheTmpDir
      ? join(buildCacheTmpDir, ".nuxt")
      : join(outputDir, ".nuxt");

    // Seed the .nuxt dir with the project's existing build cache to avoid cold starts.
    // Exclude dist/ — that's the compiled app output and causes Nuxt to skip the Vite/Nitro
    // build step entirely, so nothing ever gets written to NITRO_OUTPUT_DIR.
    const sourceDotNuxt = resolve(projectRoot, ".nuxt");
    if (existsSync(sourceDotNuxt)) {
      cpSync(sourceDotNuxt, nuxtBuildDir, {
        recursive: true,
        filter: (src) => !src.startsWith(resolve(sourceDotNuxt, "dist")),
      });
    }

    console.log(
      existingBuildDir
        ? `\n[e2e] Building Nuxt app into ${existingBuildDir} (set EXISTING_BUILD_DIR to a directory with an existing .output to skip)...\n`
        : "\n[e2e] Building Nuxt app (set EXISTING_BUILD_DIR to reuse an existing build)...\n",
    );
    const buildStart = Date.now();
    try {
      execSync("npx nuxt build", {
        cwd: projectRoot,
        stdio: "pipe",
        env: {
          ...process.env,
          NUXT_BUILD_DIR: nuxtBuildDir,
          NITRO_OUTPUT_DIR: join(outputDir, ".output"),
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
  ensureTestImage();
  const fixtureServer: FileServer = await startFileServer(cacheDir);
  process.env.TEST_FIXTURE_SERVER_URL = fixtureServer.url;

  // Create the template database and apply all migrations.
  const runId = randomUUID().replace(/-/g, "").slice(0, 16);
  const templateDbName = `media_cache_test_${runId}_tmpl`;

  // These are inherited by worker processes spawned after globalSetup.
  process.env.TEST_RUN_ID = runId;
  process.env.TEST_TEMPLATE_DB = templateDbName;

  // Create a fake plugins directory with the test plugin "installed" so that
  // loadInstalledPlugins() picks it up via PLUGINS_DIR.
  const testPluginsDir = join(tmpdir(), `media-cache-test-plugins-${runId}`);
  mkdirSync(join(testPluginsDir, "node_modules", "test-plugin"), {
    recursive: true,
  });
  writeFileSync(
    join(testPluginsDir, "package.json"),
    JSON.stringify(
      {
        name: "media-cache-test-plugins",
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
    `export { default } from ${JSON.stringify(resolve(projectRoot, "tests/unit/fixtures/test-plugin.ts"))};
`,
  );
  process.env.TEST_PLUGINS_DIR = testPluginsDir;

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
