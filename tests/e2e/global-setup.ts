/**
 * Playwright global setup — runs once before any workers start.
 *
 * 1. Builds the Nuxt app (set SKIP_BUILD=true to reuse an existing build).
 * 2. Creates a migrated PostgreSQL template database that each worker will
 *    copy from.
 * 3. Returns a teardown function that drops all databases created for this run.
 */

import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FullConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const projectRoot = resolve(import.meta.dirname, "../..");
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
  const buildCacheTmpDir = process.env.SKIP_BUILD
    ? null
    : mkdtempSync(join(tmpdir(), "nuxt-e2e-cache-"));
  const outputTmpDir = process.env.SKIP_BUILD
    ? null
    : mkdtempSync(join(tmpdir(), "nuxt-e2e-output-"));
  process.env.TEST_SERVER_OUTPUT_DIR = outputTmpDir
    ? join(outputTmpDir, ".output")
    : resolve(projectRoot, ".output");

  console.log(
    `[e2e] Server output dir: ${process.env.TEST_SERVER_OUTPUT_DIR}\n`,
  );

  if (buildCacheTmpDir && outputTmpDir) {
    // Seed the temp .nuxt dir with the project's existing build cache to avoid cold starts
    const sourceDotNuxt = resolve(projectRoot, ".nuxt");
    const destDotNuxt = join(buildCacheTmpDir, ".nuxt");
    if (existsSync(sourceDotNuxt)) {
      cpSync(sourceDotNuxt, destDotNuxt, { recursive: true });
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

  // Ensure the test video fixture exists in tests/.cache/ (gitignored).
  // Generated on first run using Docker ffmpeg with a changing testsrc2 pattern.
  const cacheDir = resolve(projectRoot, "tests/.cache");
  const testVideoPath = join(cacheDir, "test-video.mp4");
  if (!existsSync(testVideoPath)) {
    console.log("[e2e] Generating test video fixture via Docker ffmpeg...");
    mkdirSync(cacheDir, { recursive: true });
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${cacheDir}:/output`,
        "jrottenberg/ffmpeg:6.1-alpine",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x240:rate=25:duration=60",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=22050:duration=60",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-y",
        "/output/test-video.mp4",
      ],
      { stdio: "pipe" },
    );
    console.log("[e2e] Test video fixture generated.\n");
  }

  // Start a local HTTP server to serve static test fixture files (e.g. test videos).
  // This avoids relying on external URLs that may be behind bot protection.
  const fixtureServer = createServer((req, res) => {
    const filePath = join(cacheDir, req.url?.split("?")[0] ?? "");
    // Prevent path traversal
    if (!filePath.startsWith(`${cacheDir}/`)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const ext = filePath.split(".").pop() ?? "";
    const mimeTypes: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const fileSize = stat.size;
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
      });
      createReadStream(filePath).pipe(res);
    }
  });
  await new Promise<void>((resolve) =>
    fixtureServer.listen(0, "127.0.0.1", resolve),
  );
  const fixtureServerPort = (fixtureServer.address() as AddressInfo).port;
  process.env.TEST_FIXTURE_SERVER_URL = `http://127.0.0.1:${fixtureServerPort}`;

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
