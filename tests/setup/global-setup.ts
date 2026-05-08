import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = resolve(
  import.meta.dirname,
  "../../server/database/migrations",
);

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

export async function setup() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is not set");

  const adminClient = postgres(withDatabase(baseUrl, "postgres"), { max: 1 });
  try {
    await adminClient`DROP DATABASE IF EXISTS media_cache_test`;
    await adminClient`CREATE DATABASE media_cache_test`;
  } finally {
    await adminClient.end();
  }

  const migrateClient = postgres(withDatabase(baseUrl, "media_cache_test"), {
    max: 1,
  });
  try {
    const db = drizzle(migrateClient);
    await migrate(db, { migrationsFolder });
  } finally {
    await migrateClient.end();
  }
}

export default setup;
