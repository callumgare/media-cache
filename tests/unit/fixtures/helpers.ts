import { startLiaseQueryExecution } from "@@/server/lib/liase/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import type { GenericMedia } from "@liase/core";
import { sql } from "drizzle-orm";

export const TEST_REQUEST = {
  source: "test-source" as const,
  queryType: "test-handler" as const,
};

export const TEST_REQUEST_WITH_COUNT = {
  source: "test-source" as const,
  queryType: "test-handler-with-count" as const,
};

export function makeMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `https://example.com/media-${id}.mp4`,
        video: true,
        audio: false,
        image: false,
      },
    ],
    ...overrides,
  };
}

export function makeImageMedia(
  overrides: Partial<GenericMedia> = {},
): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `https://example.com/image-${id}.jpg`,
        video: false,
        audio: false,
        image: true,
      },
    ],
    ...overrides,
  };
}

export function enqueueMedia(medias: GenericMedia[]) {
  if (!globalThis.__testPluginQueue) globalThis.__testPluginQueue = [];
  globalThis.__testPluginQueue.push(medias);
}

export async function truncateAll() {
  // TRUNCATE CASCADE handles self-referential FKs (group.parentId) and all inter-table FKs
  await db.execute(sql`
    TRUNCATE TABLE
      liase_query_media,
      liase_query_media_content,
      liase_query_execution,
      liase_query,
      deleted_cache_media,
      cache_media,
      "group",
      source
    RESTART IDENTITY CASCADE
  `);
  // Reset the test plugin queue so stale enqueued items don't bleed into the next test
  globalThis.__testPluginQueue = [];
}

export async function getCacheMediaAll() {
  return db.select().from(dbSchema.cacheMedia);
}

export async function getDeletedCacheMediaAll() {
  return db.select().from(dbSchema.deletedCacheMedia);
}

export async function getCacheMediaById(id: number) {
  return db.query.cacheMedia.findFirst({ where: (m, { eq }) => eq(m.id, id) });
}

export async function getGroupByName(name: string) {
  return db.query.group.findFirst({ where: (g, { eq }) => eq(g.name, name) });
}

export async function getLiaseQueryExecutionAll() {
  return db.select().from(dbSchema.liaseQueryExecution);
}

export async function getLiaseQueryMediaAll() {
  return db.select().from(dbSchema.liaseQueryMedia);
}

export async function createTestLiaseQuery(requestOptions = TEST_REQUEST) {
  const [row] = await db
    .insert(dbSchema.liaseQuery)
    .values({
      title: "Test Query",
      requestOptions,
      schedule: 0,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to insert test liase query");
  return row;
}

export async function runLiaseQuery(liaseQuery?: dbSchema.LiaseQuery) {
  const q = liaseQuery ?? (await createTestLiaseQuery());
  const { executionPromise } = await startLiaseQueryExecution(q);
  await executionPromise;
}
