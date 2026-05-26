import { startLiaseQueryExecution } from "@@/server/lib/liase/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import type { GenericMedia, GenericRequest } from "@liase/core";
import { sql } from "drizzle-orm";
import objectHash from "object-hash";

export const TEST_REQUEST = {
  source: "test-source" as const,
  queryType: "test-handler" as const,
};

export const TEST_REQUEST_WITH_COUNT = {
  source: "test-source" as const,
  queryType: "test-handler-with-count" as const,
};

export const TEST_REQUEST_PAGINATED_OFFSET = {
  source: "test-source" as const,
  queryType: "test-handler-paginated-offset" as const,
};

export const TEST_REQUEST_PAGINATED_CURSOR = {
  source: "test-source" as const,
  queryType: "test-handler-paginated-cursor" as const,
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

export function makeDetailedMedia(
  overrides: Partial<GenericMedia> = {},
): GenericMedia {
  return {
    liaseSource: "test-source",
    id: 42,
    files: [
      {
        type: "main",
        url: "https://example.com/media/42/stream",
        ext: "mp4",
        mimeType: "video/mp4",
        image: false,
        video: true,
        audio: true,
        width: 1920,
        height: 1080,
        duration: 1486.52,
      },
      {
        type: "thumbnail",
        url: "https://example.com/media/42/stream.mp4?resolution=LOW",
        ext: "mp4",
        mimeType: "video/mp4",
        image: false,
        video: true,
        audio: true,
      },
      {
        type: "poster",
        url: "https://example.com/media/42/poster.jpg",
        image: true,
        video: false,
        audio: false,
      },
    ],
    url: "https://example.com/media/42",
    title: "Example Media Title",
    tags: ["action", "documentary"],
    dateUploaded: "2020-03-31T15:56:34.000Z",
    dateOriginallyPublished: "2012-08-17",
    description:
      "A detailed example media item used for testing field mapping.",
    duration: 1486.52,
    ...overrides,
  };
}

export function enqueueMedia(medias: GenericMedia[]) {
  if (!globalThis.__testPluginQueue) globalThis.__testPluginQueue = [];
  globalThis.__testPluginQueue.push(medias);
}

/**
 * Enqueues the nextCursor values for each page in the cursor-paginated test handler.
 * Call once per page, in order. Pass `null` for the last page.
 */
export function enqueueNextCursors(cursors: (string | number | null)[]) {
  if (!globalThis.__testPluginNextCursors)
    globalThis.__testPluginNextCursors = [];
  globalThis.__testPluginNextCursors.push(...cursors);
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
      source,
      query_secret
    RESTART IDENTITY CASCADE
  `);
  // Reset the test plugin queue so stale enqueued items don't bleed into the next test
  globalThis.__testPluginQueue = [];
  globalThis.__testPluginRequestedPages = [];
  globalThis.__testPluginNextCursors = [];
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

export async function createTestLiaseQuery(
  requestOptions: GenericRequest = TEST_REQUEST,
) {
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

/**
 * Directly inserts a liaseQueryMediaContent + liaseQueryMedia row as if the
 * given media had been fetched and committed during a real execution.
 * Useful for setting up resume-scenario DB state without running a full execution.
 */
export async function insertLiaseQueryMedia(
  queryId: number,
  executionId: number,
  media: GenericMedia,
  foundInLatestExecution = true,
) {
  const liaseId = `${media.liaseSource}\t${media.id}`;
  const contentHash = objectHash(media);

  await db
    .insert(dbSchema.liaseQueryMediaContent)
    .values({ liaseId, contentHash, content: media, updatedAt: new Date() })
    .onConflictDoNothing({
      target: dbSchema.liaseQueryMediaContent.contentHash,
    });

  await db
    .insert(dbSchema.liaseQueryMedia)
    .values({
      updatedAt: new Date(),
      liaseId,
      foundInLatestExecution,
      queryExecutionIdCreatedOn: executionId,
      queryId,
      contentHash,
    })
    .onConflictDoNothing({
      target: [
        dbSchema.liaseQueryMedia.contentHash,
        dbSchema.liaseQueryMedia.queryId,
      ],
    });
}

/**
 * Creates a liaseQueryExecution row in the DB with the given resume checkpoint
 * fields set — simulating an execution that was interrupted mid-run.
 */
export async function createExecutionWithCheckpoint(
  queryId: number,
  checkpoint: {
    resumeStage?: string;
    resumeVariationIndex?: number;
    resumePageNumber?: number | null;
    resumeCursor?: string | number | null;
    resumePagesFetched?: number;
    resumeVariationPagesFetched?: number;
    // Stat counters saved by the signal-handler checkpoint or the stage transition.
    // When provided they seed the resumed execution so progress isn't lost.
    liaseMediaFound?: number;
    liaseMediaNew?: number;
    liaseMediaUpdated?: number;
    liaseMediaRemoved?: number;
    liaseMediaUnchanged?: number;
    cacheMediaCreated?: number;
    cacheMediaUpdated?: number;
    cacheMediaUnchanged?: number;
    cacheMediaDeleted?: number;
  },
) {
  const [row] = await db
    .insert(dbSchema.liaseQueryExecution)
    .values({
      queryId,
      status: "running",
      updatedAt: new Date(),
      startedAt: new Date(),
      resumeStage: checkpoint.resumeStage ?? null,
      resumeVariationIndex: checkpoint.resumeVariationIndex ?? 0,
      resumePageNumber: checkpoint.resumePageNumber ?? null,
      resumeCursor: checkpoint.resumeCursor ?? null,
      resumePagesFetched: checkpoint.resumePagesFetched ?? 0,
      resumeVariationPagesFetched: checkpoint.resumeVariationPagesFetched ?? 0,
      ...(checkpoint.liaseMediaFound !== undefined && {
        liaseMediaFound: checkpoint.liaseMediaFound,
      }),
      ...(checkpoint.liaseMediaNew !== undefined && {
        liaseMediaNew: checkpoint.liaseMediaNew,
      }),
      ...(checkpoint.liaseMediaUpdated !== undefined && {
        liaseMediaUpdated: checkpoint.liaseMediaUpdated,
      }),
      ...(checkpoint.liaseMediaRemoved !== undefined && {
        liaseMediaRemoved: checkpoint.liaseMediaRemoved,
      }),
      ...(checkpoint.liaseMediaUnchanged !== undefined && {
        liaseMediaUnchanged: checkpoint.liaseMediaUnchanged,
      }),
      ...(checkpoint.cacheMediaCreated !== undefined && {
        cacheMediaCreated: checkpoint.cacheMediaCreated,
      }),
      ...(checkpoint.cacheMediaUpdated !== undefined && {
        cacheMediaUpdated: checkpoint.cacheMediaUpdated,
      }),
      ...(checkpoint.cacheMediaUnchanged !== undefined && {
        cacheMediaUnchanged: checkpoint.cacheMediaUnchanged,
      }),
      ...(checkpoint.cacheMediaDeleted !== undefined && {
        cacheMediaDeleted: checkpoint.cacheMediaDeleted,
      }),
    })
    .returning();
  if (!row) throw new Error("Failed to create execution with checkpoint");
  return row;
}
