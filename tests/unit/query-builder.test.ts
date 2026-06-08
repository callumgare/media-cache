import { db, dbSchema } from "@@/server/utils/drizzle";
import { calculateWhereValue } from "@@/server/utils/query-builder";
import type {
  QueryCondition,
  QueryGroupCondition,
} from "@@/types/query-condition";
import { sql } from "drizzle-orm";
/**
 * Integration tests for calculateBM25WhereValue.
 *
 * Rows are inserted directly into cache_media so we control liaseSourceIds exactly.
 * Each test runs calculateBM25WhereValue as the WHERE clause of a real SQL query,
 * exercising the BM25 index and asserting correctness of the result set.
 *
 * Seed layout:
 *   vid-a  — liaseSourceIds: ['source-a'], video (hasVideo=true, hasImage=false)
 *   vid-b  — liaseSourceIds: ['source-b'], video
 *   img-a  — liaseSourceIds: ['source-a'], image (hasVideo=false, hasImage=true)
 *   img-b  — liaseSourceIds: ['source-b'], image
 */
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./fixtures/helpers";

beforeEach(truncateAll);

// ─── seed ────────────────────────────────────────────────────────────────────

async function seedMedia() {
  const now = new Date();
  await db.insert(dbSchema.cacheMedia).values([
    {
      lastIndexedAt: now,
      title: "vid-a",
      liaseSourceIds: ["source-a"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
    },
    {
      lastIndexedAt: now,
      title: "vid-b",
      liaseSourceIds: ["source-b"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
    },
    {
      lastIndexedAt: now,
      title: "img-a",
      liaseSourceIds: ["source-a"],
      hasVideo: false,
      hasImage: true,
      hasAudio: false,
    },
    {
      lastIndexedAt: now,
      title: "img-b",
      liaseSourceIds: ["source-b"],
      hasVideo: false,
      hasImage: true,
      hasAudio: false,
    },
  ]);
}

// ─── query helper ─────────────────────────────────────────────────────────────

/** Returns the titles of matching cache_media rows, sorted alphabetically. */
async function titlesWhere(condition: QueryCondition): Promise<string[]> {
  const where = calculateWhereValue(condition);
  const rows = await db.execute<{ title: string }>(
    sql`SELECT title FROM cache_media WHERE ${where}`,
  );
  return rows.map((r: { title: string }) => r.title).sort();
}

// ─── condition builders ───────────────────────────────────────────────────────

let _nextId = 100;
function nextId() {
  return _nextId++;
}

function group(
  operator: "AND" | "OR",
  conditions: QueryCondition[],
): QueryGroupCondition {
  return { id: nextId(), type: "group", operator, conditions };
}
function source(value: string): QueryCondition {
  return {
    id: nextId(),
    type: "field",
    field: "source",
    operator: "equals",
    value,
  };
}
function mediaType(value: string): QueryCondition {
  return {
    id: nextId(),
    type: "field",
    field: "type",
    operator: "equals",
    value,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("calculateBM25WhereValue — operator combinations", () => {
  it("empty conditions → matches all rows", async () => {
    await seedMedia();
    expect(await titlesWhere(group("AND", []))).toEqual([
      "img-a",
      "img-b",
      "vid-a",
      "vid-b",
    ]);
  });

  describe("single AND group", () => {
    it("AND[source=a] → source-a rows", async () => {
      await seedMedia();
      expect(await titlesWhere(group("AND", [source("source-a")]))).toEqual([
        "img-a",
        "vid-a",
      ]);
    });

    it("AND[source=a, type=video] → video from source-a only", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [source("source-a"), mediaType("video")]),
        ),
      ).toEqual(["vid-a"]);
    });

    it("AND[source=b, type=image] → image from source-b only", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [source("source-b"), mediaType("image")]),
        ),
      ).toEqual(["img-b"]);
    });

    it("AND[type=video] → all videos", async () => {
      await seedMedia();
      expect(await titlesWhere(group("AND", [mediaType("video")]))).toEqual([
        "vid-a",
        "vid-b",
      ]);
    });
  });

  describe("single OR group", () => {
    it("OR[source=a, source=b] → all rows", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("OR", [source("source-a"), source("source-b")]),
        ),
      ).toEqual(["img-a", "img-b", "vid-a", "vid-b"]);
    });

    it("OR[source=a] single child → source-a rows", async () => {
      await seedMedia();
      expect(await titlesWhere(group("OR", [source("source-a")]))).toEqual([
        "img-a",
        "vid-a",
      ]);
    });

    it("OR[type=video, type=image] → all rows", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("OR", [mediaType("video"), mediaType("image")]),
        ),
      ).toEqual(["img-a", "img-b", "vid-a", "vid-b"]);
    });

    it("OR[source=a, type=video] → source-a rows ∪ all videos", async () => {
      await seedMedia();
      // img-a (source-a), vid-a (source-a + video), vid-b (video) = 3 rows
      expect(
        await titlesWhere(
          group("OR", [source("source-a"), mediaType("video")]),
        ),
      ).toEqual(["img-a", "vid-a", "vid-b"]);
    });

    it("OR[type=image, source=b] → all images ∪ source-b rows", async () => {
      await seedMedia();
      // img-a (image), img-b (image + source-b), vid-b (source-b) = 3 rows
      expect(
        await titlesWhere(
          group("OR", [mediaType("image"), source("source-b")]),
        ),
      ).toEqual(["img-a", "img-b", "vid-b"]);
    });
  });

  describe("AND containing OR", () => {
    it("AND[type=video, OR[source=a, source=b]] → all videos", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [
            mediaType("video"),
            group("OR", [source("source-a"), source("source-b")]),
          ]),
        ),
      ).toEqual(["vid-a", "vid-b"]);
    });

    it("AND[source=a, OR[type=video, type=image]] → all source-a rows", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [
            source("source-a"),
            group("OR", [mediaType("video"), mediaType("image")]),
          ]),
        ),
      ).toEqual(["img-a", "vid-a"]);
    });

    it("AND[source=a, OR[source=a, source=b]] → source-a (AND narrows the OR)", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [
            source("source-a"),
            group("OR", [source("source-a"), source("source-b")]),
          ]),
        ),
      ).toEqual(["img-a", "vid-a"]);
    });
  });

  describe("OR containing AND", () => {
    it("OR[AND[source=a, type=video], AND[source=b, type=image]] → vid-a and img-b", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("OR", [
            group("AND", [source("source-a"), mediaType("video")]),
            group("AND", [source("source-b"), mediaType("image")]),
          ]),
        ),
      ).toEqual(["img-b", "vid-a"]);
    });

    it("OR[AND[source=a, type=video], AND[source=a, type=image]] → all source-a rows", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("OR", [
            group("AND", [source("source-a"), mediaType("video")]),
            group("AND", [source("source-a"), mediaType("image")]),
          ]),
        ),
      ).toEqual(["img-a", "vid-a"]);
    });
  });

  describe("deep nesting", () => {
    it("AND[AND[AND[source=a]]] → source-a rows (triple-nested AND)", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [group("AND", [group("AND", [source("source-a")])])]),
        ),
      ).toEqual(["img-a", "vid-a"]);
    });

    it("OR[OR[source=a, source=b], type=video] → all rows (outer OR broadens)", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("OR", [
            group("OR", [source("source-a"), source("source-b")]),
            mediaType("video"),
          ]),
        ),
      ).toEqual(["img-a", "img-b", "vid-a", "vid-b"]);
    });

    it("AND[OR[source=a, source=b], OR[type=video, type=image]] → all rows", async () => {
      await seedMedia();
      expect(
        await titlesWhere(
          group("AND", [
            group("OR", [source("source-a"), source("source-b")]),
            group("OR", [mediaType("video"), mediaType("image")]),
          ]),
        ),
      ).toEqual(["img-a", "img-b", "vid-a", "vid-b"]);
    });

    it("AND[source=a, OR[type=video, AND[source=b, type=image]]] → vid-a only", async () => {
      await seedMedia();
      // source=a AND (type=video OR (source=b AND type=image))
      // vid-a: source-a ✓, type=video ✓ → yes
      // img-a: source-a ✓, type=image but NOT source-b → no
      expect(
        await titlesWhere(
          group("AND", [
            source("source-a"),
            group("OR", [
              mediaType("video"),
              group("AND", [source("source-b"), mediaType("image")]),
            ]),
          ]),
        ),
      ).toEqual(["vid-a"]);
    });
  });
});

// ─── duration filter ─────────────────────────────────────────────────────────

/**
 * Seed layout:
 *   short  — duration 2 s, source-a
 *   medium — duration 5 s, source-b
 *   long   — duration 10 s, source-a
 *   nodur  — duration null (image), source-b
 */
async function seedDurationMedia() {
  const now = new Date();
  await db.insert(dbSchema.cacheMedia).values([
    {
      lastIndexedAt: now,
      title: "short",
      liaseSourceIds: ["source-a"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
      duration: 2,
    },
    {
      lastIndexedAt: now,
      title: "medium",
      liaseSourceIds: ["source-b"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
      duration: 5,
    },
    {
      lastIndexedAt: now,
      title: "long",
      liaseSourceIds: ["source-a"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
      duration: 10,
    },
    {
      lastIndexedAt: now,
      title: "nodur",
      liaseSourceIds: ["source-b"],
      hasVideo: false,
      hasImage: true,
      hasAudio: false,
      duration: null,
    },
  ]);
}

function duration(
  value: { min?: number | null; max?: number | null } | "",
): QueryCondition {
  return {
    id: nextId(),
    type: "field",
    field: "duration",
    operator: "is between",
    value,
  };
}

describe("calculateBM25WhereValue — duration range", () => {
  it("empty string value → matches all rows", async () => {
    await seedDurationMedia();
    expect(await titlesWhere(group("AND", [duration("")]))).toEqual([
      "long",
      "medium",
      "nodur",
      "short",
    ]);
  });

  it("{ min: null, max: null } → matches all rows", async () => {
    await seedDurationMedia();
    expect(
      await titlesWhere(group("AND", [duration({ min: null, max: null })])),
    ).toEqual(["long", "medium", "nodur", "short"]);
  });

  it("max only → rows with duration ≤ max", async () => {
    await seedDurationMedia();
    // nodur has null duration and should not match
    expect(await titlesWhere(group("AND", [duration({ max: 4 })]))).toEqual([
      "short",
    ]);
  });

  it("min only → rows with duration ≥ min", async () => {
    await seedDurationMedia();
    expect(await titlesWhere(group("AND", [duration({ min: 4 })]))).toEqual([
      "long",
      "medium",
    ]);
  });

  it("min and max → rows with duration in range (inclusive)", async () => {
    await seedDurationMedia();
    expect(
      await titlesWhere(group("AND", [duration({ min: 3, max: 7 })])),
    ).toEqual(["medium"]);
  });

  it("exact match via min=max → single matching row", async () => {
    await seedDurationMedia();
    expect(
      await titlesWhere(group("AND", [duration({ min: 5, max: 5 })])),
    ).toEqual(["medium"]);
  });

  it("range that includes all videos → excludes null-duration rows", async () => {
    await seedDurationMedia();
    expect(
      await titlesWhere(group("AND", [duration({ min: 0, max: 100 })])),
    ).toEqual(["long", "medium", "short"]);
  });

  it("combined AND[duration, source] → intersection", async () => {
    await seedDurationMedia();
    // source-a has short (2s) and long (10s); max: 3 picks only short
    expect(
      await titlesWhere(
        group("AND", [source("source-a"), duration({ max: 3 })]),
      ),
    ).toEqual(["short"]);
  });

  it("OR[duration, source] → union", async () => {
    await seedDurationMedia();
    // duration max: 3 → short; source-b → medium, nodur; union = short, medium, nodur
    expect(
      await titlesWhere(
        group("OR", [duration({ max: 3 }), source("source-b")]),
      ),
    ).toEqual(["medium", "nodur", "short"]);
  });
});

// ─── favourited filter ────────────────────────────────────────────────────────

function favourited(value: "yes" | "no" | ""): QueryCondition {
  return {
    id: nextId(),
    type: "field",
    field: "favourited",
    operator: "equals",
    value,
  };
}

/** Returns or creates the first user in the DB. */
async function ensureUser(): Promise<number> {
  const existing = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (existing) return existing.id;
  const created = await db
    .insert(dbSchema.user)
    .values({ username: "test-user", updatedAt: new Date() })
    .returning({ id: dbSchema.user.id })
    .then((rows) => rows[0]);
  if (!created) throw new Error("Failed to create test user");
  return created.id;
}

/** Variant of titlesWhere that also passes a userId for the favourited filter. */
async function titlesWhereWithUser(
  condition: QueryCondition,
  userId: number,
): Promise<string[]> {
  const where = calculateWhereValue(condition, { userId });
  const rows = await db.execute<{ title: string }>(
    sql`SELECT title FROM cache_media WHERE ${where}`,
  );
  return rows.map((r: { title: string }) => r.title).sort();
}

describe("calculateWhereValue — favourited filter", () => {
  it("empty string value → matches all rows", async () => {
    await seedMedia();
    const userId = await ensureUser();
    expect(
      await titlesWhereWithUser(group("AND", [favourited("")]), userId),
    ).toEqual(["img-a", "img-b", "vid-a", "vid-b"]);
  });

  it('value "yes" → only rows favourited by the user', async () => {
    await seedMedia();
    const userId = await ensureUser();
    const allRows = await db
      .select({ id: dbSchema.cacheMedia.id, title: dbSchema.cacheMedia.title })
      .from(dbSchema.cacheMedia)
      .orderBy(dbSchema.cacheMedia.title);
    if (allRows.length < 2) throw new Error("Expected at least 2 seeded rows");
    // Favourite the first two rows
    await db.insert(dbSchema.userCacheMediaInfo).values([
      { userId, cacheMediaId: allRows[0].id, favourited: true },
      { userId, cacheMediaId: allRows[1].id, favourited: true },
    ]);
    const expectedTitles = [allRows[0].title, allRows[1].title].sort();
    expect(
      await titlesWhereWithUser(group("AND", [favourited("yes")]), userId),
    ).toEqual(expectedTitles);
  });

  it('value "no" → only rows not favourited by the user', async () => {
    await seedMedia();
    const userId = await ensureUser();
    const allRows = await db
      .select({ id: dbSchema.cacheMedia.id, title: dbSchema.cacheMedia.title })
      .from(dbSchema.cacheMedia)
      .orderBy(dbSchema.cacheMedia.title);
    if (allRows.length < 2) throw new Error("Expected at least 2 seeded rows");
    const favouritedTitles = [allRows[0].title, allRows[1].title];
    await db.insert(dbSchema.userCacheMediaInfo).values([
      { userId, cacheMediaId: allRows[0].id, favourited: true },
      { userId, cacheMediaId: allRows[1].id, favourited: true },
    ]);
    const allTitles = allRows.map((r) => r.title).sort();
    const expectedTitles = allTitles.filter(
      (t) => !favouritedTitles.includes(t),
    );
    expect(
      await titlesWhereWithUser(group("AND", [favourited("no")]), userId),
    ).toEqual(expectedTitles);
  });

  it('value "yes" without userId → matches all rows (no filter applied)', async () => {
    await seedMedia();
    // When no userId is passed, the favourited filter is silently skipped
    expect(await titlesWhere(group("AND", [favourited("yes")]))).toEqual([
      "img-a",
      "img-b",
      "vid-a",
      "vid-b",
    ]);
  });

  it("AND[yes, source] → intersection of favourited and source filter", async () => {
    await seedMedia();
    const userId = await ensureUser();
    const sourceARows = await db
      .select({ id: dbSchema.cacheMedia.id, title: dbSchema.cacheMedia.title })
      .from(dbSchema.cacheMedia)
      .where(
        sql`${dbSchema.cacheMedia.liaseSourceIds} @> ARRAY['source-a']::text[]`,
      );
    if (sourceARows.length === 0) throw new Error("Expected source-a rows");
    // Mark only the first source-a row as favourited
    await db
      .insert(dbSchema.userCacheMediaInfo)
      .values({ userId, cacheMediaId: sourceARows[0].id, favourited: true });
    expect(
      await titlesWhereWithUser(
        group("AND", [source("source-a"), favourited("yes")]),
        userId,
      ),
    ).toEqual([sourceARows[0].title]);
  });
});
