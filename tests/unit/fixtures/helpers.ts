import { startFinderQueryExecution } from "@@/server/lib/media-finder/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { sql } from "drizzle-orm";
import type { GenericMedia } from "media-finder";

export const TEST_REQUEST = {
  source: "test-source" as const,
  queryType: "test-handler" as const,
};

export function makeMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    mediaFinderSource: "test-source",
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
    mediaFinderSource: "test-source",
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
      finder_query_media,
      finder_query_media_content,
      finder_query_execution,
      finder_query,
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

export async function getFinderQueryExecutionAll() {
  return db.select().from(dbSchema.finderQueryExecution);
}

export async function getFinderQueryMediaAll() {
  return db.select().from(dbSchema.finderQueryMedia);
}

export async function createTestFinderQuery(requestOptions = TEST_REQUEST) {
  const [row] = await db
    .insert(dbSchema.finderQuery)
    .values({
      title: "Test Query",
      requestOptions,
      schedule: 0,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to insert test finder query");
  return row;
}

export async function runMediaFinderQuery(finderQuery?: dbSchema.FinderQuery) {
  const q = finderQuery ?? (await createTestFinderQuery());
  const { executionPromise } = await startFinderQueryExecution(q);
  await executionPromise;
}
