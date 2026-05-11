import { startFinderQueryExecution } from "@@/server/lib/media-finder/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import {
  createTestFinderQuery,
  enqueueMedia,
  getCacheMediaAll,
  getDeletedCacheMediaAll,
  getFinderQueryExecutionAll,
  getFinderQueryMediaAll,
  makeImageMedia,
  makeMedia,
  runMediaFinderQuery,
  truncateAll,
} from "@@/tests/unit/fixtures/helpers";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(truncateAll);

describe("runMediaFinderQuery — basic lifecycle", () => {
  it("creates cache_media for new media", async () => {
    const m = makeMedia({ id: "media-1", title: "Hello World" });
    enqueueMedia([m]);

    await runMediaFinderQuery();

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Hello World");
    expect(all[0].finderSourceIds).toEqual(["test-source"]);
    expect(all[0].finderIds).toEqual(["test-source\tmedia-1"]);
  });

  it("creates multiple cache_media entries for multiple media", async () => {
    enqueueMedia([
      makeMedia({ id: "a" }),
      makeMedia({ id: "b" }),
      makeMedia({ id: "c" }),
    ]);

    await runMediaFinderQuery();

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(3);
  });

  it("records a finderQueryExecution row", async () => {
    enqueueMedia([makeMedia()]);
    await runMediaFinderQuery();

    const executions = await getFinderQueryExecutionAll();
    expect(executions).toHaveLength(1);
    expect(executions[0].finderMediaFound).toBe(1);
    expect(executions[0].finderMediaNew).toBe(1);
    expect(executions[0].finderMediaUpdated).toBe(0);
    expect(executions[0].finderMediaRemoved).toBe(0);
  });

  it("populates hasVideo / hasImage flags from the main file", async () => {
    const video = makeMedia({ id: "vid" });
    const image = makeImageMedia({ id: "img" });
    enqueueMedia([video, image]);

    await runMediaFinderQuery();

    const all = await getCacheMediaAll();
    const vidRow = all.find((r) => r.finderIds.includes("test-source\tvid"));
    const imgRow = all.find((r) => r.finderIds.includes("test-source\timg"));
    if (!vidRow) throw new Error("Expected to find a video row in cache_media");
    if (!imgRow)
      throw new Error("Expected to find an image row in cache_media");

    expect(vidRow.hasVideo).toBe(true);
    expect(vidRow.hasImage).toBe(false);
    expect(imgRow.hasImage).toBe(true);
    expect(imgRow.hasVideo).toBe(false);
  });
});

describe("runMediaFinderQuery — second run, no changes", () => {
  it("does not create duplicate cache_media on unchanged second run", async () => {
    const q = await createTestFinderQuery();
    const m = makeMedia({ id: "stable" });
    enqueueMedia([m]);
    await runMediaFinderQuery(q);

    enqueueMedia([m]);
    await runMediaFinderQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
  });

  it("records mediaUpdated=0 when nothing changed", async () => {
    const q = await createTestFinderQuery();
    const m = makeMedia({ id: "stable" });

    enqueueMedia([m]);
    await runMediaFinderQuery(q);

    enqueueMedia([m]);
    await runMediaFinderQuery(q);

    const execs = await getFinderQueryExecutionAll();
    const second = execs.sort((a, b) => b.id - a.id)[0];
    if (!second) throw new Error("Expected at least one execution");
    expect(second.finderMediaUpdated).toBe(0);
    expect(second.finderMediaNew).toBe(0);
  });
});

describe("runMediaFinderQuery — update", () => {
  it("updates cache_media when media content changes", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "upd", title: "Old Title" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([makeMedia({ id: "upd", title: "New Title" })]);
    await runMediaFinderQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("New Title");
  });

  it("records mediaUpdated=1 on content change", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "upd", title: "v1" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([makeMedia({ id: "upd", title: "v2" })]);
    await runMediaFinderQuery(q);

    const execs = await getFinderQueryExecutionAll();
    const second = execs.sort((a, b) => b.id - a.id)[0];
    if (!second) throw new Error("Expected at least one execution");
    expect(second.finderMediaUpdated).toBe(1);
    expect(second.finderMediaNew).toBe(0);
  });
});

describe("runMediaFinderQuery — removal", () => {
  it("deletes cache_media when media is no longer in results", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([]); // empty second run
    await runMediaFinderQuery(q);

    expect(await getCacheMediaAll()).toHaveLength(0);
  });

  it("inserts a deleted_cache_media record on removal", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runMediaFinderQuery(q);

    const [before] = await getCacheMediaAll();
    enqueueMedia([]);
    await runMediaFinderQuery(q);

    const deleted = await getDeletedCacheMediaAll();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].cacheMediaId).toBe(before?.id);
    expect(deleted[0].mergedIntoCacheMediaId).toBeNull();
    expect(deleted[0].deletionReason).toBe("all-sources-removed");
  });

  it("records mediaRemoved=1 on deletion", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "gone" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([]);
    await runMediaFinderQuery(q);

    const execs = await getFinderQueryExecutionAll();
    const second = execs.sort((a, b) => b.id - a.id)[0];
    if (!second) throw new Error("Expected at least one execution");
    expect(second.finderMediaRemoved).toBe(1);
  });
});

describe("runMediaFinderQuery — re-add after removal", () => {
  it("creates a fresh cache_media when re-added after removal", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "cycle" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([]);
    await runMediaFinderQuery(q);

    expect(await getCacheMediaAll()).toHaveLength(0);

    enqueueMedia([makeMedia({ id: "cycle", title: "Back Again" })]);
    await runMediaFinderQuery(q);

    const all = await getCacheMediaAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Back Again");
  });

  it("accumulates two deleted_cache_media records after remove-readd-remove", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "cycle2" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([]);
    await runMediaFinderQuery(q);

    enqueueMedia([makeMedia({ id: "cycle2" })]);
    await runMediaFinderQuery(q);

    enqueueMedia([]);
    await runMediaFinderQuery(q);

    expect(await getDeletedCacheMediaAll()).toHaveLength(2);
    expect(await getCacheMediaAll()).toHaveLength(0);
  });
});

describe("runMediaFinderQuery — tags", () => {
  it("creates group rows for tags and links them via groupIds", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "tagged", tags: ["cats", "dogs"] })]);
    await runMediaFinderQuery(q);

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
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "tagged2", tags: ["alpha"] })]);
    await runMediaFinderQuery(q);

    enqueueMedia([makeMedia({ id: "tagged2", tags: ["beta"] })]);
    await runMediaFinderQuery(q);

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
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "notags", tags: ["removeme"] })]);
    await runMediaFinderQuery(q);

    enqueueMedia([makeMedia({ id: "notags", tags: [] })]);
    await runMediaFinderQuery(q);

    const all = await getCacheMediaAll();
    expect(all[0].groupIds).toHaveLength(0);
  });
});

describe("runMediaFinderQuery — cleanup", () => {
  it("deletes old finder_query_media rows after second run", async () => {
    const q = await createTestFinderQuery();
    enqueueMedia([makeMedia({ id: "cleanup" })]);
    await runMediaFinderQuery(q);

    const afterFirst = await getFinderQueryMediaAll();
    expect(afterFirst).toHaveLength(1);

    enqueueMedia([makeMedia({ id: "cleanup" })]);
    await runMediaFinderQuery(q);

    // Only the current execution's row should remain
    const afterSecond = await getFinderQueryMediaAll();
    expect(afterSecond).toHaveLength(1);

    const execs = await getFinderQueryExecutionAll();
    const latest = execs.sort((a, b) => b.id - a.id)[0];
    if (!latest) throw new Error("Expected at least one execution");
    expect(afterSecond[0].queryExecutionId).toBe(latest.id);
  });

  it("retains the current execution's finder_query_media row after a single run", async () => {
    enqueueMedia([makeMedia({ id: "no-query" })]);
    await runMediaFinderQuery();

    const all = await getFinderQueryMediaAll();
    expect(all).toHaveLength(1);
  });
});

describe("runMediaFinderQuery — aggregation", () => {
  it("aggregates views as sum across sources", async () => {
    // Two media from the same "source" with views — they are independent cache entries
    enqueueMedia([
      makeMedia({ id: "v1", views: 100 }),
      makeMedia({ id: "v2", views: 200 }),
    ]);
    await runMediaFinderQuery();

    const all = await getCacheMediaAll();
    const views = all.map((r) => r.views).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(views).toEqual([100, 200]);
  });

  it("picks first truthy title from sources", async () => {
    enqueueMedia([makeMedia({ id: "titled", title: "First Title" })]);
    await runMediaFinderQuery();

    const all = await getCacheMediaAll();
    expect(all[0].title).toBe("First Title");
  });

  it("stores sources jsonb with correct fields", async () => {
    const m = makeMedia({ id: "src-test", title: "Source Test", views: 42 });
    enqueueMedia([m]);
    await runMediaFinderQuery();

    const [row] = await getCacheMediaAll();
    const sources = row.sources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0].finderSourceId).toBe("test-source");
    expect(sources[0].finderMediaId).toBe("src-test");
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
    await runMediaFinderQuery();

    const [row] = await getCacheMediaAll();
    expect(row.files?.[0].url).toBe("https://example.com/vid.mp4");
  });
});

describe("runMediaFinderQuery — empty query", () => {
  it("creates no cache_media when query returns no results", async () => {
    enqueueMedia([]);
    await runMediaFinderQuery();

    expect(await getCacheMediaAll()).toHaveLength(0);
  });

  it("still records a finderQueryExecution with mediaFound=0", async () => {
    enqueueMedia([]);
    await runMediaFinderQuery();

    const execs = await getFinderQueryExecutionAll();
    expect(execs).toHaveLength(1);
    expect(execs[0].finderMediaFound).toBe(0);
  });
});

describe("runMediaFinderQuery — fetchCountLimit", () => {
  // Each variation = one request = one page (test plugin uses paginationType: "none").
  // Multi-page scenarios are simulated by using multiple variations.
  async function createQueryWithLimit(opts: {
    fetchCountLimit: number;
    fetchCountLimitPerVariation?: boolean;
    queryVariations?: dbSchema.QueryVariation[];
  }) {
    const [row] = await db
      .insert(dbSchema.finderQuery)
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
    if (!row) throw new Error("Failed to insert test finder query");
    return row;
  }

  const TWO_VARIATIONS: dbSchema.QueryVariation[] = [
    { id: "v1", fieldOverrides: { keyword: ["alpha"] } },
    { id: "v2", fieldOverrides: { keyword: ["beta"] } },
  ];

  it("fetches media normally when limit is not exceeded", async () => {
    const q = await createQueryWithLimit({ fetchCountLimit: 5 });
    enqueueMedia([makeMedia({ id: "m1" }), makeMedia({ id: "m2" })]);

    await runMediaFinderQuery(q);

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

    await runMediaFinderQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.finderIds);
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

    await runMediaFinderQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.finderIds);
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

    await runMediaFinderQuery(q);

    const ids = (await getCacheMediaAll()).flatMap((r) => r.finderIds);
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

    await runMediaFinderQuery(q);

    const execs = await getFinderQueryExecutionAll();
    expect(execs[0].pageCount).toBe(1);
  });
});
