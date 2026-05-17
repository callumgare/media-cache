import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = resolve(
  import.meta.dirname,
  "../../server/database/migrations",
);

export function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

export async function setup() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is not set");

  const runId = randomUUID().replace(/-/g, "").slice(0, 16);
  const templateDbName = `media_cache_test_${runId}_tmpl`;

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
}

export async function teardown() {
  const baseUrl = process.env.DATABASE_URL;
  const runId = process.env.TEST_RUN_ID;
  if (!baseUrl || !runId) return;

  const adminUrl = withDatabase(baseUrl, "postgres");
  const adminClient = postgres(adminUrl, { max: 1 });
  try {
    const dbs = await adminClient<{ datname: string }[]>`
      SELECT datname FROM pg_database
      WHERE datname LIKE ${`media_cache_test_${runId}_%`}
    `;
    for (const { datname } of dbs) {
      await adminClient.unsafe(
        `DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`,
      );
    }
  } finally {
    await adminClient.end();
  }
}

export default setup;
