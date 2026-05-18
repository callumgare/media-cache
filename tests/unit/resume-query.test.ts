import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import {
  buildLiaseQueryOptions,
  expandAllVariations,
  runLiaseQueryExecution,
} from "@@/server/lib/liase/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_REQUEST_PAGINATED_CURSOR,
  TEST_REQUEST_PAGINATED_OFFSET,
  createExecutionWithCheckpoint,
  createTestLiaseQuery,
  enqueueMedia,
  enqueueNextCursors,
  getCacheMediaAll,
  getDeletedCacheMediaAll,
  getLiaseQueryExecutionAll,
  getLiaseQueryMediaAll,
  insertLiaseQueryMedia,
  makeMedia,
  runLiaseQuery,
  truncateAll,
} from "./fixtures/helpers";

beforeEach(truncateAll);

// ---------------------------------------------------------------------------
// Helper: run an execution using the standard options for a saved query
// ---------------------------------------------------------------------------
async function resumeExecution(
  exec: dbSchema.LiaseQueryExecution,
  savedQuery: dbSchema.LiaseQuery,
) {
  const liaseRequests = expandAllVariations(savedQuery);
  await runLiaseQueryExecution({
    liaseQueryExecution: exec,
    liaseRequests,
    liaseQueryOptions: buildLiaseQueryOptions(savedQuery, liaseRequests),
    savedLiaseQuery: savedQuery,
  });
}

// ---------------------------------------------------------------------------
// Signal handler
// ---------------------------------------------------------------------------

describe("signal handler", () => {
  // Cleanup registered savers after each test in this group
  const TEST_SAVER_ID_A = 99001;
  const TEST_SAVER_ID_B = 99002;
  afterEach(() => {
    queryExecutionTaskSystem.unregisterCheckpointSaver(TEST_SAVER_ID_A);
    queryExecutionTaskSystem.unregisterCheckpointSaver(TEST_SAVER_ID_B);
  });

  it("calls all registered checkpoint savers when handleSignal() is invoked", async () => {
    let saver1Called = false;
    let saver2Called = false;

    queryExecutionTaskSystem.registerCheckpointSaver(
      TEST_SAVER_ID_A,
      async () => {
        saver1Called = true;
      },
    );
    queryExecutionTaskSystem.registerCheckpointSaver(
      TEST_SAVER_ID_B,
      async () => {
        saver2Called = true;
      },
    );

    await queryExecutionTaskSystem.handleSignal();

    expect(saver1Called).toBe(true);
    expect(saver2Called).toBe(true);
  });

  it("unregistered savers are not called", async () => {
    let called = false;
    queryExecutionTaskSystem.registerCheckpointSaver(
      TEST_SAVER_ID_A,
      async () => {
        called = true;
      },
    );
    queryExecutionTaskSystem.unregisterCheckpointSaver(TEST_SAVER_ID_A);

    await queryExecutionTaskSystem.handleSignal();

    expect(called).toBe(false);
  });

  it("flushes the in-progress page checkpoint to the DB", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
    });

    // Simulate what run-query.ts would register after fetching 2 pages
    queryExecutionTaskSystem.registerCheckpointSaver(exec.id, async () => {
      await db
        .update(dbSchema.liaseQueryExecution)
        .set({
          resumeStage: "fetching-liase-results",
          resumeVariationIndex: 0,
          resumePageNumber: 3,
          resumePagesFetched: 2,
          resumeVariationPagesFetched: 2,
          updatedAt: new Date(),
        })
        .where(eq(dbSchema.liaseQueryExecution.id, exec.id));
    });

    await queryExecutionTaskSystem.handleSignal();

    const updated = await db.query.liaseQueryExecution.findFirst({
      where: eq(dbSchema.liaseQueryExecution.id, exec.id),
    });
    expect(updated?.resumePageNumber).toBe(3);
    expect(updated?.resumePagesFetched).toBe(2);
    expect(updated?.resumeStage).toBe("fetching-liase-results");
  });
});

// ---------------------------------------------------------------------------
// Resume from fetching-liase-results — offset pagination
// ---------------------------------------------------------------------------

describe("resume from fetching-liase-results — offset pagination", () => {
  it("starts fetching from the saved page number, not from page 1", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
      resumePageNumber: 3,
      resumePagesFetched: 2,
      resumeVariationPagesFetched: 2,
    });

    // Simulate pages 1-2 already committed to DB
    await insertLiaseQueryMedia(q.id, exec.id, makeMedia({ id: "page1-a" }));
    await insertLiaseQueryMedia(q.id, exec.id, makeMedia({ id: "page2-a" }));

    // Only page 3 remains to be fetched
    globalThis.__testPluginRequestedPages = [];
    enqueueMedia([makeMedia({ id: "page3-a" })]);

    await resumeExecution(exec, q);

    // The handler should only have been called once, for page 3
    expect(globalThis.__testPluginRequestedPages).toHaveLength(1);
    expect(globalThis.__testPluginRequestedPages[0]?.pageNumber).toBe(3);

    // All 3 media rows should be present and marked as found
    const mediaRows = await getLiaseQueryMediaAll();
    expect(mediaRows).toHaveLength(3);
    expect(mediaRows.every((r) => r.foundInLatestExecution)).toBe(true);

    // Cache media should be created for all 3
    expect(await getCacheMediaAll()).toHaveLength(3);

    // Execution should be completed with the correct total page count
    const [execRow] = await getLiaseQueryExecutionAll();
    expect(execRow?.status).toBe("completed");
    expect(execRow?.pageCount).toBe(3); // started at 2, fetched 1 more
  });

  it("resumes correctly from page 1 when pageNumber checkpoint is null", async () => {
    // Interrupted after initialising but before any page was fetched
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
      resumePageNumber: null, // no page yet
      resumePagesFetched: 0,
    });

    globalThis.__testPluginRequestedPages = [];
    enqueueMedia([makeMedia({ id: "media-a" })]);

    await resumeExecution(exec, q);

    expect(globalThis.__testPluginRequestedPages[0]?.pageNumber).toBe(1);
    expect(await getCacheMediaAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Resume from fetching-liase-results — cursor pagination
// ---------------------------------------------------------------------------

describe("resume from fetching-liase-results — cursor pagination", () => {
  it("starts fetching from the saved cursor", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_CURSOR);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
      resumeCursor: "cursor-after-page-2",
      resumePagesFetched: 2,
      resumeVariationPagesFetched: 2,
    });

    await insertLiaseQueryMedia(q.id, exec.id, makeMedia({ id: "page1-a" }));
    await insertLiaseQueryMedia(q.id, exec.id, makeMedia({ id: "page2-a" }));

    globalThis.__testPluginRequestedPages = [];
    enqueueMedia([makeMedia({ id: "page3-a" })]);
    enqueueNextCursors([null]); // no further pages

    await resumeExecution(exec, q);

    // First request should use the saved cursor
    expect(globalThis.__testPluginRequestedPages).toHaveLength(1);
    expect(globalThis.__testPluginRequestedPages[0]?.cursor).toBe(
      "cursor-after-page-2",
    );

    expect(await getLiaseQueryMediaAll()).toHaveLength(3);
    expect(await getCacheMediaAll()).toHaveLength(3);

    const [execRow] = await getLiaseQueryExecutionAll();
    expect(execRow?.status).toBe("completed");
    expect(execRow?.pageCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// initialising stage skipped on resume
// ---------------------------------------------------------------------------

describe("initialising stage is skipped when resumeStage is set", () => {
  it("does not reset foundInLatestExecution for already-fetched rows", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
      resumePageNumber: 2,
      resumePagesFetched: 1,
      resumeVariationPagesFetched: 1,
    });

    // Page 1 was already committed with foundInLatestExecution = true
    await insertLiaseQueryMedia(
      q.id,
      exec.id,
      makeMedia({ id: "page1-a" }),
      true,
    );

    enqueueMedia([makeMedia({ id: "page2-a" })]);
    await resumeExecution(exec, q);

    // If initialising had run it would have set foundInLatestExecution = false for page1-a.
    // The processing stage would then have treated it as absent and not created cache media.
    // So 2 cache media rows confirms initialising was skipped.
    expect(await getCacheMediaAll()).toHaveLength(2);

    const mediaRows = await getLiaseQueryMediaAll();
    expect(mediaRows.every((r) => r.foundInLatestExecution)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Variation index — skip already-completed variations
// ---------------------------------------------------------------------------

describe("resumeVariationIndex — completed variations are skipped", () => {
  it("does not re-fetch variations before resumeVariationIndex", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);

    // Two variations with no field overrides — expandAllVariations returns 2 identical requests
    await db
      .update(dbSchema.liaseQuery)
      .set({
        queryVariations: [
          { id: "var-1", fieldOverrides: {} },
          { id: "var-2", fieldOverrides: {} },
        ],
        updatedAt: new Date(),
      })
      .where(eq(dbSchema.liaseQuery.id, q.id));
    const freshQ = await db.query.liaseQuery.findFirst({
      where: eq(dbSchema.liaseQuery.id, q.id),
    });
    if (!freshQ) throw new Error("Query not found");

    // Pre-populate variation 0's media (already fetched)
    const exec = await createExecutionWithCheckpoint(freshQ.id, {
      resumeStage: "fetching-liase-results",
      resumeVariationIndex: 1, // skip variation 0
      resumePagesFetched: 1,
    });
    await insertLiaseQueryMedia(
      freshQ.id,
      exec.id,
      makeMedia({ id: "var0-a" }),
    );

    // Queue exactly one page — only variation 1 should consume it
    globalThis.__testPluginRequestedPages = [];
    enqueueMedia([makeMedia({ id: "var1-a" })]);

    const liaseRequests = expandAllVariations(freshQ);
    await runLiaseQueryExecution({
      liaseQueryExecution: exec,
      liaseRequests,
      liaseQueryOptions: buildLiaseQueryOptions(freshQ, liaseRequests),
      savedLiaseQuery: freshQ,
    });

    // If variation 0 ran it would consume the one queued page and variation 1
    // would make an empty request — giving requestedPages.length === 2.
    // Correct skip: only variation 1 runs → requestedPages.length === 1.
    expect(globalThis.__testPluginRequestedPages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Per-variation fetch limit adjustment
// ---------------------------------------------------------------------------

describe("fetch limit is reduced by already-fetched pages on resume", () => {
  it("stops fetching at the original limit even after resuming mid-variation", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    await db
      .update(dbSchema.liaseQuery)
      .set({
        fetchCountLimit: 3,
        fetchCountLimitPerVariation: true,
        updatedAt: new Date(),
      })
      .where(eq(dbSchema.liaseQuery.id, q.id));
    const freshQ = await db.query.liaseQuery.findFirst({
      where: eq(dbSchema.liaseQuery.id, q.id),
    });
    if (!freshQ) throw new Error("Query not found");

    // 1 page already fetched; resume at page 2; limit is 3 → should fetch 2 more (pages 2 & 3)
    const exec = await createExecutionWithCheckpoint(freshQ.id, {
      resumeStage: "fetching-liase-results",
      resumePageNumber: 2,
      resumePagesFetched: 1,
      resumeVariationPagesFetched: 1,
    });

    globalThis.__testPluginRequestedPages = [];
    // Queue more pages than the limit allows
    enqueueMedia([makeMedia()]); // page 2
    enqueueMedia([makeMedia()]); // page 3 — limit reached (1 + 2 = 3)
    enqueueMedia([makeMedia()]); // page 4 — must NOT be fetched
    enqueueMedia([makeMedia()]); // page 5 — must NOT be fetched

    const liaseRequests = expandAllVariations(freshQ);
    await runLiaseQueryExecution({
      liaseQueryExecution: exec,
      liaseRequests,
      liaseQueryOptions: buildLiaseQueryOptions(freshQ, liaseRequests),
      savedLiaseQuery: freshQ,
    });

    expect(globalThis.__testPluginRequestedPages).toHaveLength(2);
    expect(
      globalThis.__testPluginRequestedPages.map((p) => p.pageNumber),
    ).toEqual([2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Resume from processing-added-or-updated (fetching already done)
// ---------------------------------------------------------------------------

describe("resume from processing-added-or-updated", () => {
  it("creates cache media without re-fetching from the API", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-added-or-updated",
    });

    // Pre-populate liaseQueryMedia as if fetching had already completed
    await insertLiaseQueryMedia(
      q.id,
      exec.id,
      makeMedia({ id: "media-a" }),
      true,
    );
    await insertLiaseQueryMedia(
      q.id,
      exec.id,
      makeMedia({ id: "media-b" }),
      true,
    );

    globalThis.__testPluginRequestedPages = [];
    await resumeExecution(exec, q);

    // The API handler must not have been called
    expect(globalThis.__testPluginRequestedPages).toHaveLength(0);

    // Cache media should be created for both pre-loaded items
    expect(await getCacheMediaAll()).toHaveLength(2);

    const [execRow] = await getLiaseQueryExecutionAll();
    expect(execRow?.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Stat counters carry forward from a signal-handler checkpoint
// ---------------------------------------------------------------------------

describe("stat counters carry forward on resume", () => {
  it("adds new finds to liaseMediaFound saved in a mid-fetch checkpoint", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    // Simulate 5 items found in the now-interrupted first portion of the run
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "fetching-liase-results",
      resumePageNumber: 3,
      resumePagesFetched: 2,
      resumeVariationPagesFetched: 2,
      liaseMediaFound: 5,
    });

    // Pre-populate those 5 rows as if they were already committed
    for (let i = 1; i <= 5; i++) {
      await insertLiaseQueryMedia(
        q.id,
        exec.id,
        makeMedia({ id: `old-${i}` }),
        true,
      );
    }

    // Queue page 3 with 2 more items
    enqueueMedia([makeMedia({ id: "new-1" }), makeMedia({ id: "new-2" })]);

    await resumeExecution(exec, q);

    const [execRow] = await getLiaseQueryExecutionAll();
    // 5 (checkpoint) + 2 (this run) = 7
    expect(execRow?.liaseMediaFound).toBe(7);
    // All 7 are new (no previous completed execution)
    expect(execRow?.liaseMediaNew).toBe(7);
    expect(execRow?.cacheMediaCreated).toBe(7);
  });

  it("carries liaseMediaFound forward when resuming from processing stage", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);
    // Fetching fully completed and saved liaseMediaFound=4 before the server restarted
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-added-or-updated",
      liaseMediaFound: 4,
    });

    for (let i = 1; i <= 4; i++) {
      await insertLiaseQueryMedia(
        q.id,
        exec.id,
        makeMedia({ id: `item-${i}` }),
        true,
      );
    }

    globalThis.__testPluginRequestedPages = [];
    await resumeExecution(exec, q);

    // Fetching must not be called again
    expect(globalThis.__testPluginRequestedPages).toHaveLength(0);

    const [execRow] = await getLiaseQueryExecutionAll();
    // liaseMediaFound was preserved from the checkpoint
    expect(execRow?.liaseMediaFound).toBe(4);
    // Processing ran from scratch and created 4 cache entries
    expect(execRow?.liaseMediaNew).toBe(4);
    expect(execRow?.cacheMediaCreated).toBe(4);
    expect(execRow?.status).toBe("completed");
  });

  it("saves all stats at the processing-added-or-updated → processing-removed transition", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);

    // Execution resumes at processing-added-or-updated (fetching already done).
    // No stats are pre-seeded — they must be written by the stage transition itself.
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-added-or-updated",
      liaseMediaFound: 3,
    });
    for (let i = 1; i <= 3; i++) {
      await insertLiaseQueryMedia(
        q.id,
        exec.id,
        makeMedia({ id: `item-${i}` }),
        true,
      );
    }

    // Intercept updateTask when processing-removed announces itself — this fires
    // immediately after the transition write, so the DB row reflects exactly
    // what the transition persisted.
    let rowAtTransition: dbSchema.LiaseQueryExecution | undefined;
    const originalUpdateTask = queryExecutionTaskSystem.updateTask.bind(
      queryExecutionTaskSystem,
    );
    vi.spyOn(queryExecutionTaskSystem, "updateTask").mockImplementation(
      async (executionId, updates) => {
        if (updates.stage === "processing-removed" && executionId === exec.id) {
          rowAtTransition = await db.query.liaseQueryExecution.findFirst({
            where: eq(dbSchema.liaseQueryExecution.id, exec.id),
          });
        }
        return originalUpdateTask(executionId, updates);
      },
    );

    await resumeExecution(exec, q);
    vi.restoreAllMocks();

    // The transition write must have flushed these stats to the DB.
    // Without the fix these are still -1 (DB default) or 0.
    expect(rowAtTransition?.resumeStage).toBe("processing-removed");
    expect(rowAtTransition?.liaseMediaNew).toBe(3);
    expect(rowAtTransition?.cacheMediaCreated).toBe(3);
    expect(rowAtTransition?.liaseMediaUpdated).toBe(0);
    expect(rowAtTransition?.liaseMediaUnchanged).toBe(0);
    expect(rowAtTransition?.cacheMediaUpdated).toBe(0);
    expect(rowAtTransition?.cacheMediaUnchanged).toBe(0);
  });

  it("saves all stats at the processing-removed → removing-previous-execution-results transition", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);

    // First execution creates a cache_media entry that the second execution will remove.
    enqueueMedia([makeMedia({ id: "will-be-removed" })]);
    await runLiaseQuery(q);

    // Second execution: item is absent from the new fetch → foundInLatestExecution=false.
    // No stats pre-seeded — they must come from what processing-removed accumulates
    // and then writes at its own stage transition.
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ foundInLatestExecution: false });
    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-removed",
    });

    // Intercept updateTask when removing-previous-execution-results announces itself
    // — fires right after the processing-removed → removing-previous-execution-results
    // transition write.
    let rowAtTransition: dbSchema.LiaseQueryExecution | undefined;
    const originalUpdateTask = queryExecutionTaskSystem.updateTask.bind(
      queryExecutionTaskSystem,
    );
    vi.spyOn(queryExecutionTaskSystem, "updateTask").mockImplementation(
      async (executionId, updates) => {
        if (
          updates.stage === "removing-previous-execution-results" &&
          executionId === exec.id
        ) {
          rowAtTransition = await db.query.liaseQueryExecution.findFirst({
            where: eq(dbSchema.liaseQueryExecution.id, exec.id),
          });
        }
        return originalUpdateTask(executionId, updates);
      },
    );

    await resumeExecution(exec, q);
    vi.restoreAllMocks();

    // The transition write must have flushed these stats.
    // Without the fix these are still -1 (DB default) or 0.
    expect(rowAtTransition?.resumeStage).toBe(
      "removing-previous-execution-results",
    );
    expect(rowAtTransition?.liaseMediaRemoved).toBe(1);
    expect(rowAtTransition?.cacheMediaDeleted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Resume from processing-removed (fetching + processing-added already done)
// ---------------------------------------------------------------------------

describe("resume from processing-removed", () => {
  it("removes media no longer present without re-fetching from the API", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);

    // Run a full first execution so cache_media exists
    enqueueMedia([makeMedia({ id: "will-be-removed" })]);
    await runLiaseQuery(q);
    expect(await getCacheMediaAll()).toHaveLength(1);

    // Simulate an interrupted second execution:
    // - initialising already ran → all rows set to foundInLatestExecution = false
    // - fetching ran but returned nothing new (the media is absent from the new run)
    // - interrupted before processing-removed ran
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ foundInLatestExecution: false });

    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-removed",
    });

    globalThis.__testPluginRequestedPages = [];
    await resumeExecution(exec, q);

    // The API handler must not have been called
    expect(globalThis.__testPluginRequestedPages).toHaveLength(0);

    // The previously-cached media should now be deleted
    expect(await getCacheMediaAll()).toHaveLength(0);
    expect(await getDeletedCacheMediaAll()).toHaveLength(1);

    const execs = await getLiaseQueryExecutionAll();
    const resumedExec = execs.find((e) => e.id === exec.id);
    expect(resumedExec?.status).toBe("completed");
  });

  it("does not fail with duplicate key when media was already deleted in a prior partial run", async () => {
    const q = await createTestLiaseQuery(TEST_REQUEST_PAGINATED_OFFSET);

    // Run a full first execution so cache_media exists
    enqueueMedia([makeMedia({ id: "will-be-removed" })]);
    await runLiaseQuery(q);
    const allCacheMedia = await getCacheMediaAll();
    expect(allCacheMedia).toHaveLength(1);
    const cacheMediaEntry = allCacheMedia[0];
    if (!cacheMediaEntry) throw new Error("Expected cache media entry");

    // Simulate a second execution whose initialising stage ran
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ foundInLatestExecution: false });

    // Simulate that processing-removed already ran partially:
    // the cache_media was deleted and deleted_cache_media was inserted
    // (matching the successful transaction in deleteCacheMediaEntry)
    await db
      .delete(dbSchema.cacheMedia)
      .where(eq(dbSchema.cacheMedia.id, cacheMediaEntry.id));
    await db.insert(dbSchema.deletedCacheMedia).values({
      updatedAt: new Date(),
      cacheMediaId: cacheMediaEntry.id,
      deletionReason: "all-sources-removed",
      mergedIntoCacheMediaId: null,
    });

    const exec = await createExecutionWithCheckpoint(q.id, {
      resumeStage: "processing-removed",
    });

    // Resume must not throw a duplicate key error
    await expect(resumeExecution(exec, q)).resolves.toBeUndefined();

    const execs = await getLiaseQueryExecutionAll();
    const resumedExec = execs.find((e) => e.id === exec.id);
    expect(resumedExec?.status).toBe("completed");

    // deleted_cache_media should still have exactly one entry (not doubled)
    expect(await getDeletedCacheMediaAll()).toHaveLength(1);
  });
});
