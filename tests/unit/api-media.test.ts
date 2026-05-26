import { db, dbSchema } from "@@/server/utils/drizzle";
import { calculateWhereValue } from "@@/server/utils/query-builder";
import type { QueryGroupCondition } from "@@/types/query-condition";
import type { SortConfig } from "@@/types/sort-config";
import { asc, desc, sql } from "drizzle-orm";
/**
 * Tests for /api/media filtering logic.
 * We bypass HTTP and call calculateWhereValue + DB directly,
 * matching exactly what the handler does.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_REQUEST,
  createTestLiaseQuery,
  enqueueMedia,
  makeImageMedia,
  makeMedia,
  runLiaseQuery,
  truncateAll,
} from "./fixtures/helpers";

beforeEach(truncateAll);

// ── Sort helpers (mirror buildOrderBy in /api/media.ts) ──────────────────────

function buildOrderBy(sort: SortConfig, seed = 0) {
  if (sort.field === "random") {
    return sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`;
  }
  const dir = sort.direction === "desc" ? desc : asc;
  if (sort.field === "createdOrUploadedAt")
    return dir(
      sql`COALESCE(${dbSchema.cacheMedia.earliestCreatedAt}, ${dbSchema.cacheMedia.earliestUploadedAt})`,
    );
  if (sort.field === "firstIndexedAt")
    return dir(dbSchema.cacheMedia.firstIndexedAt);
  if (sort.field === "updatedAt") return dir(dbSchema.cacheMedia.updatedAt);
  if (sort.field === "duration")
    return dir(sql`COALESCE(${dbSchema.cacheMedia.duration}, -1)`);
  return dir(dbSchema.cacheMedia.title);
}

async function querySorted(sort: SortConfig, seed = 0) {
  return db
    .select({
      id: dbSchema.cacheMedia.id,
      title: dbSchema.cacheMedia.title,
      duration: dbSchema.cacheMedia.duration,
      earliestCreatedAt: dbSchema.cacheMedia.earliestCreatedAt,
      earliestUploadedAt: dbSchema.cacheMedia.earliestUploadedAt,
      firstIndexedAt: dbSchema.cacheMedia.firstIndexedAt,
      updatedAt: dbSchema.cacheMedia.updatedAt,
    })
    .from(dbSchema.cacheMedia)
    .orderBy(buildOrderBy(sort, seed));
}

/** Direct-insert seed for sort tests (no liase pipeline needed). */
async function seedSortMedia() {
  await db.insert(dbSchema.cacheMedia).values([
    {
      // earliestCreatedAt wins for createdOrUploadedAt; oldest firstIndexedAt
      firstIndexedAt: new Date("2020-01-15"),
      updatedAt: new Date("2024-01-01"),
      title: "Alpha",
      duration: 10,
      earliestCreatedAt: new Date("2021-01-01"),
      earliestUploadedAt: new Date("2023-01-01"),
      liaseSourceIds: ["test-source"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
    },
    {
      // no earliestCreatedAt — falls back to earliestUploadedAt
      firstIndexedAt: new Date("2023-03-15"),
      updatedAt: new Date("2023-08-01"),
      title: "Bravo",
      duration: 5,
      earliestCreatedAt: null,
      earliestUploadedAt: new Date("2024-06-15"),
      liaseSourceIds: ["test-source"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
    },
    {
      // earliestCreatedAt (2022-06-01) is later than earliestUploadedAt (2022-03-20)
      firstIndexedAt: new Date("2021-07-01"),
      updatedAt: new Date("2025-05-01"),
      title: "Charlie",
      duration: 30,
      earliestCreatedAt: new Date("2022-06-01"),
      earliestUploadedAt: new Date("2022-03-20"),
      liaseSourceIds: ["test-source"],
      hasVideo: true,
      hasImage: false,
      hasAudio: false,
    },
    {
      // no dates at all — sorts last in ASC, first in DESC for createdOrUploadedAt
      firstIndexedAt: new Date("2025-11-01"),
      updatedAt: new Date("2022-12-01"),
      title: "Delta",
      duration: null,
      earliestCreatedAt: null,
      earliestUploadedAt: null,
      liaseSourceIds: ["test-source"],
      hasVideo: false,
      hasImage: true,
      hasAudio: false,
    },
  ]);
}

// Mirrors the handler's filtered query
async function queryMediaWhere(condition: QueryGroupCondition) {
  const whereClause = calculateWhereValue(condition) ?? undefined;
  return db
    .select({
      id: dbSchema.cacheMedia.id,
      title: dbSchema.cacheMedia.title,
      liaseIds: dbSchema.cacheMedia.liaseIds,
    })
    .from(dbSchema.cacheMedia)
    .where(whereClause);
}

function makeCondition(
  overrides: Partial<QueryGroupCondition> = {},
): QueryGroupCondition {
  return {
    id: 1,
    type: "group",
    operator: "AND",
    conditions: [],
    ...overrides,
  };
}

async function seedMedia() {
  // Seed via runLiaseQuery so groupIds etc are correctly populated
  enqueueMedia([
    makeMedia({ id: "vid-a", title: "Video A", tags: ["cats"] }),
    makeMedia({ id: "vid-b", title: "Video B", tags: ["dogs"] }),
    makeImageMedia({ id: "img-a", title: "Image A", tags: ["cats", "dogs"] }),
    {
      liaseSource: "test-source",
      id: "vid-c",
      title: "Video C (audio)",
      tags: [],
      files: [
        {
          type: "main",
          url: "https://example.com/c.mp4",
          video: true,
          audio: true,
          image: false,
        },
      ],
    },
  ]);
  await runLiaseQuery();
}

async function getGroupId(name: string): Promise<number> {
  const g = await db.query.group.findFirst({
    where: (g, { eq }) => eq(g.name, name),
  });
  if (!g) throw new Error(`Group not found: ${name}`);
  return g.id;
}

describe("/api/media — no filter", () => {
  it("returns all media when no conditions are set", async () => {
    await seedMedia();
    const results = await queryMediaWhere(makeCondition());
    expect(results).toHaveLength(4);
  });
});

describe("/api/media — source filter", () => {
  it("filters by source using equals", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "source",
            operator: "equals",
            value: "test-source",
          },
        ],
      }),
    );
    expect(results).toHaveLength(4);
  });

  it("returns nothing for a non-existent source", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "source",
            operator: "equals",
            value: "nonexistent-source",
          },
        ],
      }),
    );
    expect(results).toHaveLength(0);
  });
});

describe("/api/media — type filter", () => {
  it("filters for video-only media", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video",
          },
        ],
      }),
    );
    // vid-a, vid-b, and vid-c are video; img-a is image; all video types count as 'video'
    const titles = results.map((r) => r.title).sort();
    expect(titles).toContain("Video A");
    expect(titles).toContain("Video B");
    expect(titles).toContain("Video C (audio)");
    expect(titles).not.toContain("Image A");
  });

  it("filters for image-only media", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "image",
          },
        ],
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Image A");
  });

  it("filters for video-with-audio", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video-with-audio",
          },
        ],
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Video C (audio)");
  });

  it("filters for video-without-audio", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video-without-audio",
          },
        ],
      }),
    );
    const titles = results.map((r) => r.title).sort();
    expect(titles).toContain("Video A");
    expect(titles).toContain("Video B");
    expect(titles).not.toContain("Video C (audio)");
  });
});

describe("/api/media — tag filter", () => {
  it("filters by single tag using includes-all", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "tags",
            operator: "includes all",
            value: [catsId],
          },
        ],
      }),
    );
    const titles = results.map((r) => r.title).sort();
    expect(titles).toContain("Video A");
    expect(titles).toContain("Image A");
    expect(titles).not.toContain("Video B");
    expect(titles).not.toContain("Video C (audio)");
  });

  it("returns empty result when requiring tags that no media has", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "tags",
            operator: "includes all",
            value: [99999],
          },
        ],
      }),
    );
    expect(results).toHaveLength(0);
  });

  it("returns only media with ALL selected tags", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const dogsId = await getGroupId("dogs");
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "tags",
            operator: "includes all",
            value: [catsId, dogsId],
          },
        ],
      }),
    );
    // Only img-a has both cats and dogs
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Image A");
  });

  it("returns all tagged media when value is empty array", async () => {
    await seedMedia();
    // Empty value = no filter applied
    const results = await queryMediaWhere(
      makeCondition({
        conditions: [
          {
            id: 2,
            type: "field",
            field: "tags",
            operator: "includes all",
            value: [],
          },
        ],
      }),
    );
    expect(results).toHaveLength(4);
  });
});

describe("/api/media — AND conditions", () => {
  it("combines type and tag with AND", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const results = await queryMediaWhere(
      makeCondition({
        operator: "AND",
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "image",
          },
          {
            id: 3,
            type: "field",
            field: "tags",
            operator: "includes all",
            value: [catsId],
          },
        ],
      }),
    );
    // img-a is image AND has cats tag
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Image A");
  });

  it("AND with contradictory conditions returns empty", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        operator: "AND",
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video",
          },
          {
            id: 3,
            type: "field",
            field: "type",
            operator: "equals",
            value: "image",
          },
        ],
      }),
    );
    expect(results).toHaveLength(0);
  });
});

describe("/api/media — OR conditions", () => {
  it("combines type conditions with OR", async () => {
    await seedMedia();
    const results = await queryMediaWhere(
      makeCondition({
        operator: "OR",
        conditions: [
          {
            id: 2,
            type: "field",
            field: "type",
            operator: "equals",
            value: "image",
          },
          {
            id: 3,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video-with-audio",
          },
        ],
      }),
    );
    const titles = results.map((r) => r.title).sort();
    expect(titles).toContain("Image A");
    expect(titles).toContain("Video C (audio)");
    expect(titles).not.toContain("Video A");
  });
});

describe("/api/media — nested group conditions", () => {
  it("supports nested AND inside OR", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const results = await queryMediaWhere(
      makeCondition({
        operator: "OR",
        conditions: [
          // Image with cats tag
          {
            id: 10,
            type: "group",
            operator: "AND",
            conditions: [
              {
                id: 11,
                type: "field",
                field: "type",
                operator: "equals",
                value: "image",
              },
              {
                id: 12,
                type: "field",
                field: "tags",
                operator: "includes all",
                value: [catsId],
              },
            ],
          },
          // OR video-with-audio
          {
            id: 13,
            type: "field",
            field: "type",
            operator: "equals",
            value: "video-with-audio",
          },
        ],
      }),
    );
    const titles = results.map((r) => r.title).sort();
    expect(titles).toContain("Image A");
    expect(titles).toContain("Video C (audio)");
    expect(titles).not.toContain("Video A");
    expect(titles).not.toContain("Video B");
  });
});

// ── Sort tests ────────────────────────────────────────────────────────────────

describe("/api/media — sort by title", () => {
  it("returns media in ascending alphabetical order", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "title", direction: "asc" });
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });

  it("returns media in descending alphabetical order", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "title", direction: "desc" });
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Delta", "Charlie", "Bravo", "Alpha"]);
  });
});

describe("/api/media — sort by duration", () => {
  it("returns media with shortest duration first (asc), null treated as -1", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "duration", direction: "asc" });
    // COALESCE(null, -1) = -1, so Delta sorts before all videos
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Delta", "Bravo", "Alpha", "Charlie"]);
  });

  it("returns media with longest duration first (desc), null treated as -1", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "duration", direction: "desc" });
    // -1 sorts after all positive durations in DESC
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
  });
});

describe("/api/media — sort by createdOrUploadedAt", () => {
  it("returns oldest createdOrUploadedAt first (asc), nulls last", async () => {
    await seedSortMedia();
    const results = await querySorted({
      field: "createdOrUploadedAt",
      direction: "asc",
    });
    // COALESCE(earliestCreatedAt, earliestUploadedAt):
    // Alpha=2021-01-01, Charlie=2022-06-01, Bravo=2024-06-15, Delta=null(last)
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Alpha", "Charlie", "Bravo", "Delta"]);
  });

  it("returns most-recent createdOrUploadedAt first (desc), nulls first", async () => {
    await seedSortMedia();
    const results = await querySorted({
      field: "createdOrUploadedAt",
      direction: "desc",
    });
    // Delta=null(first), Bravo=2024-06-15, Charlie=2022-06-01, Alpha=2021-01-01
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Delta", "Bravo", "Charlie", "Alpha"]);
  });

  it("uses earliestCreatedAt over earliestUploadedAt when both are set", async () => {
    await seedSortMedia();
    // Charlie has earliestCreatedAt=2022-06-01 and earliestUploadedAt=2022-03-20.
    // COALESCE picks earliestCreatedAt (2022-06-01), so Charlie sorts after Alpha (2021-01-01).
    const results = await querySorted({
      field: "createdOrUploadedAt",
      direction: "asc",
    });
    const titles = results.map((r) => r.title);
    const alphaIdx = titles.indexOf("Alpha");
    const charlieIdx = titles.indexOf("Charlie");
    expect(alphaIdx).toBeLessThan(charlieIdx);
  });
});

describe("/api/media — sort by firstIndexedAt", () => {
  it("returns earliest-indexed media first (asc)", async () => {
    await seedSortMedia();
    const results = await querySorted({
      field: "firstIndexedAt",
      direction: "asc",
    });
    // Alpha=2020-01-15, Charlie=2021-07-01, Bravo=2023-03-15, Delta=2025-11-01
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Alpha", "Charlie", "Bravo", "Delta"]);
  });

  it("returns most-recently-indexed media first (desc)", async () => {
    await seedSortMedia();
    const results = await querySorted({
      field: "firstIndexedAt",
      direction: "desc",
    });
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Delta", "Bravo", "Charlie", "Alpha"]);
  });
});

describe("/api/media — sort by updatedAt", () => {
  it("returns least-recently-updated media first (asc)", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "updatedAt", direction: "asc" });
    // Delta=2022-12-01, Bravo=2023-08-01, Alpha=2024-01-01, Charlie=2025-05-01
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Delta", "Bravo", "Alpha", "Charlie"]);
  });

  it("returns most-recently-updated media first (desc)", async () => {
    await seedSortMedia();
    const results = await querySorted({
      field: "updatedAt",
      direction: "desc",
    });
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
  });
});

describe("/api/media — sort by random", () => {
  it("returns all media regardless of seed", async () => {
    await seedSortMedia();
    const results = await querySorted({ field: "random" }, 42);
    expect(results).toHaveLength(4);
  });
});
