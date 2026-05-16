import { startLiaseQueryExecution } from "@@/server/lib/liase/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import {
  createTestLiaseQuery,
  enqueueMedia,
  getCacheMediaAll,
  getDeletedCacheMediaAll,
  getLiaseQueryExecutionAll,
  getLiaseQueryMediaAll,
  makeImageMedia,
  makeMedia,
  runLiaseQuery,
  truncateAll,
} from "@@/tests/unit/fixtures/helpers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(truncateAll);

describe("runLiaseQuery — basic lifecycle", () => {
  it("creates cache_media for new media", async () => {
    const m = makeMedia({ id: "media-1", title: "Hello World" });
    enqueueMedia([m]);

    await runLiaseQuery();

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Hello World");
    expect(all[0].liaseSourceIds).toEqual(["test-source"]);
    expect(all[0].liaseIds).toEqual(["test-source\tmedia-1"]);
  });

  it("creates multiple cache_media entries for multiple media", async () => {
    enqueueMedia([
      makeMedia({ id: "a" }),
      makeMedia({ id: "b" }),
      makeMedia({ id: "c" }),
    ]);

    await runLiaseQuery();

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(3);
  });

  it("records a liaseQueryExecution row", async () => {
    enqueueMedia([makeMedia()]);
    await runLiaseQuery();

    const executions = await getLiaseQueryExecutionAll();
    expect(executions).toHaveLength(1);
    expect(executions[0].liaseMediaFound).toBe(1);
    expect(executions[0].liaseMediaNew).toBe(1);
    expect(executions[0].liaseMediaUpdated).toBe(0);
    expect(executions[0].liaseMediaRemoved).toBe(0);
  });

  it("populates hasVideo / hasImage flags from the main file", async () => {
    const video = makeMedia({ id: "vid" });
    const image = makeImageMedia({ id: "img" });
    enqueueMedia([video, image]);

    await runLiaseQuery();

    const all = await getCacheMediaAll();
    const vidRow = all.find((r) => r.liaseIds.includes("test-source\tvid"));
    const imgRow = all.find((r) => r.liaseIds.includes("test-source\timg"));
    if (!vidRow) throw new Error("Expected to find a video row in cache_media");
    if (!imgRow)
      throw new Error("Expected to find an image row in cache_media");

    expect(vidRow.hasVideo).toBe(true);
    expect(vidRow.hasImage).toBe(false);
    expect(imgRow.hasImage).toBe(true);
    expect(imgRow.hasVideo).toBe(false);
  });
});

describe("runLiaseQuery — second run, no changes", () => {
  it("does not create duplicate cache_media on unchanged second run", async () => {
    const q = await createTestLiaseQuery();
    const m = makeMedia({ id: "stable" });
    enqueueMedia([m]);
    await runLiaseQuery(q);

    enqueueMedia([m]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
  });

  it("records mediaUpdated=0 when nothing changed", async () => {
    const q = await createTestLiaseQuery();
    const m = makeMedia({ id: "stable" });

    enqueueMedia([m]);
    await runLiaseQuery(q);

    enqueueMedia([m]);
    await runLiaseQuery(q);

    const execs = await getLiaseQueryExecutionAll();
    const second = execs.sort((a, b) => b.id - a.id)[0];
    if (!second) throw new Error("Expected at least one execution");
    expect(second.liaseMediaUpdated).toBe(0);
    expect(second.liaseMediaNew).toBe(0);
  });
});

describe("runLiaseQuery — update", () => {
  it("updates cache_media when media content changes", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "upd", title: "Old Title" })]);
    await runLiaseQuery(q);

    enqueueMedia([makeMedia({ id: "upd", title: "New Title" })]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("New Title");
  });

  it("records mediaUpdated=1 on content change", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "upd", title: "v1" })]);
    await runLiaseQuery(q);

    enqueueMedia([makeMedia({ id: "upd", title: "v2" })]);
    await runLiaseQuery(q);

    const execs = await getLiaseQueryExecutionAll();
    const firstExec = execs.sort((a, b) => a.id - b.id)[0];
    const secondExec = execs.sort((a, b) => a.id - b.id)[1];
    if (!firstExec || !secondExec)
      throw new Error("Expected at least two executions");
    expect(firstExec.liaseMediaFound).toBe(1);
    expect(firstExec.liaseMediaNew).toBe(1);
    expect(firstExec.liaseMediaUpdated).toBe(0);
    expect(firstExec.liaseMediaRemoved).toBe(0);
    expect(firstExec.liaseMediaUnchanged).toBe(0);
    expect(firstExec.cacheMediaCreated).toBe(1);
    expect(firstExec.cacheMediaUpdated).toBe(0);
    expect(firstExec.cacheMediaUnchanged).toBe(0);
    expect(firstExec.cacheMediaDeleted).toBe(0);

    expect(secondExec.liaseMediaFound).toBe(1);
    expect(secondExec.liaseMediaNew).toBe(0);
    expect(secondExec.liaseMediaUpdated).toBe(1);
    expect(secondExec.liaseMediaRemoved).toBe(0);
    expect(secondExec.liaseMediaUnchanged).toBe(0);
    expect(secondExec.cacheMediaCreated).toBe(0);
    expect(secondExec.cacheMediaUpdated).toBe(1);
    expect(secondExec.cacheMediaUnchanged).toBe(0);
    expect(secondExec.cacheMediaDeleted).toBe(0);
  });
});

describe("runLiaseQuery — removal", () => {
  it("deletes cache_media when media is no longer in results", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runLiaseQuery(q);

    enqueueMedia([]); // empty second run
    await runLiaseQuery(q);

    expect(await getCacheMediaAll()).toHaveLength(0);
  });

  it("inserts a deleted_cache_media record on removal", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runLiaseQuery(q);

    const [before] = await getCacheMediaAll();
    enqueueMedia([]);
    await runLiaseQuery(q);

    const deleted = await getDeletedCacheMediaAll();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].cacheMediaId).toBe(before?.id);
    expect(deleted[0].mergedIntoCacheMediaId).toBeNull();
    expect(deleted[0].deletionReason).toBe("all-sources-removed");
  });

  it("records mediaRemoved=1 on deletion", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runLiaseQuery(q);

    enqueueMedia([]);
    await runLiaseQuery(q);

    const execs = await getLiaseQueryExecutionAll();
    const second = execs.sort((a, b) => b.id - a.id)[0];
    if (!second) throw new Error("Expected at least one execution");
    expect(second.liaseMediaRemoved).toBe(1);
  });
});

describe("runLiaseQuery — re-add after removal", () => {
  it("creates a fresh cache_media when re-added after removal", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cycle" })]);
    await runLiaseQuery(q);

    enqueueMedia([]);
    await runLiaseQuery(q);

    expect(await getCacheMediaAll()).toHaveLength(0);

    enqueueMedia([makeMedia({ id: "cycle", title: "Back Again" })]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Back Again");
  });

  it("accumulates two deleted_cache_media records after remove-readd-remove", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cycle2" })]);
    await runLiaseQuery(q);

    enqueueMedia([]);
    await runLiaseQuery(q);

    enqueueMedia([makeMedia({ id: "cycle2" })]);
    await runLiaseQuery(q);

    enqueueMedia([]);
    await runLiaseQuery(q);

    expect(await getDeletedCacheMediaAll()).toHaveLength(2);
    expect(await getCacheMediaAll()).toHaveLength(0);
  });
});

describe("runLiaseQuery — tags", () => {
  it("creates group rows for tags and links them via groupIds", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "tagged", tags: ["cats", "dogs"] })]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    const groupIds = all[0].groupIds;
    expect(groupIds).toHaveLength(2);

    const groups = await db.select().from(dbSchema.group);
    const tagNames = groups
      .filter((g) => g.parentId !== null)
      .map((g) => g.name);
    expect(tagNames).toContain("cats");
    expect(tagNames).toContain("dogs");
  });

  it("updates tags when media tags change", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "tagged2", tags: ["alpha"] })]);
    await runLiaseQuery(q);

    enqueueMedia([makeMedia({ id: "tagged2", tags: ["beta"] })]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all[0].groupIds).toHaveLength(1);
    const betaGroup = await db.query.group.findFirst({
      where: (g, { eq }) => eq(g.name, "beta"),
    });
    expect(betaGroup).toBeDefined();
    const alphaGroup = await db.query.group.findFirst({
      where: (g, { eq }) => eq(g.name, "alpha"),
    });
    // alpha group still exists in the DB but no cache_media should reference it
    const isLinked =
      alphaGroup != null && all[0].groupIds.includes(String(alphaGroup.id));
    expect(isLinked).toBe(false);
  });

  it("removes groupIds when all tags are stripped", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "notags", tags: ["removeme"] })]);
    await runLiaseQuery(q);

    enqueueMedia([makeMedia({ id: "notags", tags: [] })]);
    await runLiaseQuery(q);

    const all = await getCacheMediaAll();
    expect(all[0].groupIds).toHaveLength(0);
  });
});

describe("runLiaseQuery — cleanup", () => {
  it("deletes old liase_query_media rows after second run", async () => {
    const q = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cleanup" })]);
    await runLiaseQuery(q);

    const afterFirst = await getLiaseQueryMediaAll();
    expect(afterFirst).toHaveLength(1);

    enqueueMedia([makeMedia({ id: "cleanup" })]);
    await runLiaseQuery(q);

    // Only the current execution's row should remain
    const afterSecond = await getLiaseQueryMediaAll();
    expect(afterSecond).toHaveLength(1);

    const execs = await getLiaseQueryExecutionAll();
    const latest = execs.sort((a, b) => b.id - a.id)[0];
    if (!latest) throw new Error("Expected at least one execution");
    expect(afterSecond[0].foundInLatestExecution).toBe(true);
  });

  it("retains the current execution's liase_query_media row after a single run", async () => {
    enqueueMedia([makeMedia({ id: "no-query" })]);
    await runLiaseQuery();

    const all = await getLiaseQueryMediaAll();
    expect(all).toHaveLength(1);
  });
});

describe("runLiaseQuery — aggregation", () => {
  it("aggregates views as sum across sources", async () => {
    // Two media from the same "source" with views — they are independent cache entries
    enqueueMedia([
      makeMedia({ id: "v1", views: 100 }),
      makeMedia({ id: "v2", views: 200 }),
    ]);
    await runLiaseQuery();

    const all = await getCacheMediaAll();
    const views = all.map((r) => r.views).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(views).toEqual([100, 200]);
  });

  it("picks first truthy title from sources", async () => {
    enqueueMedia([makeMedia({ id: "titled", title: "First Title" })]);
    await runLiaseQuery();

    const all = await getCacheMediaAll();
    expect(all[0].title).toBe("First Title");
  });

  it("stores sources jsonb with correct fields", async () => {
    const m = makeMedia({ id: "src-test", title: "Source Test", views: 42 });
    enqueueMedia([m]);
    await runLiaseQuery();

    const [row] = await getCacheMediaAll();
    const sources = row.sources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0].liaseSourceId).toBe("test-source");
    expect(sources[0].liaseMediaId).toBe("src-test");
    expect(sources[0].views).toBe(42);
  });

  it("stores the file url correctly", async () => {
    enqueueMedia([
      makeMedia({
        id: "file-test",
        files: [
          {
            type: "main",
            url: "https://example.com/vid.mp4",
            video: true,
            audio: false,
            image: false,
          },
        ],
      }),
    ]);
    await runLiaseQuery();

    const [row] = await getCacheMediaAll();
    expect(row.files?.[0].url).toBe("https://example.com/vid.mp4");
  });
});

describe("runLiaseQuery — empty query", () => {
  it("creates no cache_media when query returns no results", async () => {
    enqueueMedia([]);
    await runLiaseQuery();

    expect(await getCacheMediaAll()).toHaveLength(0);
  });

  it("still records a liaseQueryExecution with mediaFound=0", async () => {
    enqueueMedia([]);
    await runLiaseQuery();

    const execs = await getLiaseQueryExecutionAll();
    expect(execs).toHaveLength(1);
    expect(execs[0].liaseMediaFound).toBe(0);
  });
});

describe("runLiaseQuery — fetchCountLimit", () => {
  // Each variation = one request = one page (test plugin uses paginationType: "none").
  // Multi-page scenarios are simulated by using multiple variations.
  async function createQueryWithLimit(opts: {
    fetchCountLimit: number;
    fetchCountLimitPerVariation?: boolean;
    queryVariations?: dbSchema.QueryVariation[];
  }) {
    const [row] = await db
      .insert(dbSchema.liaseQuery)
      .values({
        title: "Limit Test Query",
        requestOptions: {
          source: "test-source" as const,
          queryType: "test-handler-with-keyword" as const,
        },
        fetchCountLimit: opts.fetchCountLimit,
        fetchCountLimitPerVariation: opts.fetchCountLimitPerVariation ?? false,
        queryVariations: opts.queryVariations ?? null,
        schedule: 0,
        updatedAt: new Date(),
      })
      .returning();
    if (!row) throw new Error("Failed to insert test liase query");
    return row;
  }

  const TWO_VARIATIONS: dbSchema.QueryVariation[] = [
    { id: "v1", fieldOverrides: { keyword: ["alpha"] } },
    { id: "v2", fieldOverrides: { keyword: ["beta"] } },
  ];

  it("fetches media normally when limit is not exceeded", async () => {
    const q = await createQueryWithLimit({ fetchCountLimit: 5 });
    enqueueMedia([makeMedia({ id: "m1" }), makeMedia({ id: "m2" })]);

    await runLiaseQuery(q);

    expect(await getCacheMediaAll()).toHaveLength(2);
  });

  it("with fetchCountLimitPerVariation=false, stops after limit pages across all variations", async () => {
    const q = await createQueryWithLimit({
      fetchCountLimit: 1,
      fetchCountLimitPerVariation: false,
      queryVariations: TWO_VARIATIONS,
    });

    // Variation 1 produces page 1 (limit reached); variation 2 should be skipped
    enqueueMedia([makeMedia({ id: "v1-m1" })]);
    enqueueMedia([makeMedia({ id: "v2-m1" })]);

    await runLiaseQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.liaseIds);
    expect(ids).toContain("test-source\tv1-m1");
    expect(ids).not.toContain("test-source\tv2-m1");
  });

  it("with fetchCountLimitPerVariation=false, fetches all variations when limit is not exceeded", async () => {
    const q = await createQueryWithLimit({
      fetchCountLimit: 2,
      fetchCountLimitPerVariation: false,
      queryVariations: TWO_VARIATIONS,
    });

    enqueueMedia([makeMedia({ id: "v1-m1" })]);
    enqueueMedia([makeMedia({ id: "v2-m1" })]);

    await runLiaseQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.liaseIds);
    expect(ids).toContain("test-source\tv1-m1");
    expect(ids).toContain("test-source\tv2-m1");
  });

  it("with fetchCountLimitPerVariation=true, all variations run regardless of total page count", async () => {
    // limit=1 per variation; the global page count (2) would stop variation 2 if
    // fetchCountLimitPerVariation were false, but here each variation is independent.
    const q = await createQueryWithLimit({
      fetchCountLimit: 1,
      fetchCountLimitPerVariation: true,
      queryVariations: TWO_VARIATIONS,
    });

    enqueueMedia([makeMedia({ id: "v1-m1" })]);
    enqueueMedia([makeMedia({ id: "v2-m1" })]);

    await runLiaseQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.liaseIds);
    expect(ids).toContain("test-source\tv1-m1");
    expect(ids).toContain("test-source\tv2-m1");
  });

  it("records correct pageCount when global limit stops fetching early", async () => {
    const q = await createQueryWithLimit({
      fetchCountLimit: 1,
      fetchCountLimitPerVariation: false,
      queryVariations: TWO_VARIATIONS,
    });

    enqueueMedia([makeMedia({ id: "v1-m1" })]);
    enqueueMedia([makeMedia({ id: "v2-m1" })]);

    await runLiaseQuery(q);

    const execs = await getLiaseQueryExecutionAll();
    expect(execs[0].pageCount).toBe(1);
  });
});

describe("runLiaseQuery — cross-query isolation", () => {
  it("does not inflate liaseMediaUnchanged/liaseMediaRemoved when a second query also holds rows for the same liaseId", async () => {
    // Q1 first run: finds M1 at version v1
    const q1 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cross", title: "v1" })]);
    await runLiaseQuery(q1);

    // Q2 also finds the same liaseId (same version)
    const q2 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cross", title: "v1" })]);
    await runLiaseQuery(q2);

    // Q1 second run: finds M1 at version v2 (changed)
    enqueueMedia([makeMedia({ id: "cross", title: "v2" })]);
    await runLiaseQuery(q1);

    const allExecs = await getLiaseQueryExecutionAll();
    const q1SecondExec = allExecs
      .filter((e) => e.queryId === q1.id)
      .sort((a, b) => a.id - b.id)[1];
    if (!q1SecondExec) throw new Error("Expected a second execution for q1");

    // Q2's liaseQueryMedia rows must not inflate these counts
    expect(q1SecondExec.liaseMediaUpdated).toBe(1);
    expect(q1SecondExec.liaseMediaUnchanged).toBe(0);
    expect(q1SecondExec.liaseMediaRemoved).toBe(0);
  });

  it("does not inflate cacheMediaUnchanged when a second query holds rows for the same liaseId", async () => {
    const q1 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cross2", title: "v1" })]);
    await runLiaseQuery(q1);

    const q2 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "cross2", title: "v1" })]);
    await runLiaseQuery(q2);

    // Q1 second run: same content (no change) — cacheMediaUnchanged should be 1, not inflated
    enqueueMedia([makeMedia({ id: "cross2", title: "v1" })]);
    await runLiaseQuery(q1);

    const allExecs = await getLiaseQueryExecutionAll();
    const q1SecondExec = allExecs
      .filter((e) => e.queryId === q1.id)
      .sort((a, b) => a.id - b.id)[1];
    if (!q1SecondExec) throw new Error("Expected a second execution for q1");

    expect(q1SecondExec.cacheMediaUnchanged).toBe(1);
    expect(q1SecondExec.cacheMediaUpdated).toBe(0);
    expect(q1SecondExec.liaseMediaUnchanged).toBe(1);
    expect(q1SecondExec.liaseMediaUpdated).toBe(0);
  });
});

describe("runLiaseQuery — cross-query property merging, same liaseId", () => {
  it("merges properties from two queries: newer query title wins, older query description is preserved", async () => {
    // q1 runs first with both a title and a description
    const q1 = await createTestLiaseQuery();
    enqueueMedia([
      makeMedia({ id: "merge-1", title: "abc", description: "xyz" }),
    ]);
    await runLiaseQuery(q1);

    // Back-date q1's row so q2's row is strictly newer
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ updatedAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(dbSchema.liaseQueryMedia.queryId, q1.id));

    // q2 runs with a different title but no description
    const q2 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "merge-1", title: "123" })]);
    await runLiaseQuery(q2);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    // newer query's title wins
    expect(all[0].title).toBe("123");
    // older query's description is preserved because the newer query had none
    expect(all[0].description).toBe("xyz");
  });

  it("merges properties from two queries: older query title is preserved when newer query has no title", async () => {
    // q1 runs first with a title
    const q1 = await createTestLiaseQuery();
    enqueueMedia([
      makeMedia({ id: "merge-2", title: "keep-me", description: "overriden" }),
    ]);
    await runLiaseQuery(q1);

    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ updatedAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(dbSchema.liaseQueryMedia.queryId, q1.id));

    // q2 runs with a description but no title (key absent, not undefined)
    const q2 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "merge-2", description: "new-desc" })]);
    await runLiaseQuery(q2);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    // older query's title is preserved because the newer query had none
    expect(all[0].title).toBe("keep-me");
    // newer query's description wins
    expect(all[0].description).toBe("new-desc");
  });
});

describe("runLiaseQuery — multiple independent queries, same media", () => {
  it("prefers values from most recently found query when same liase id is found by two independent queries", async () => {
    // q1 finds the media first
    const q1 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "shared", title: "Old Title" })]);
    await runLiaseQuery(q1);

    // Back-date q1's liaseQueryMedia row to guarantee q2's will have a strictly later updatedAt,
    // since DB round-trips may complete within the same millisecond.
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ updatedAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(dbSchema.liaseQueryMedia.queryId, q1.id));

    // q2 finds the same liase id with newer data
    const q2 = await createTestLiaseQuery();
    enqueueMedia([makeMedia({ id: "shared", title: "New Title" })]);
    await runLiaseQuery(q2);

    // Only one cache_media entry should exist (same liase id)
    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);

    // The most recently found version's values should win
    expect(all[0].title).toBe("New Title");
  });
});
