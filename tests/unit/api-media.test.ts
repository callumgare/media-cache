import { runMediaFinderQuery } from "@@/server/lib/media-finder/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { calculateWhereValue } from "@@/server/utils/query-builder";
import type { QueryGroupCondition } from "@@/types/query-condition";
/**
 * Tests for /api/media filtering logic.
 * We bypass HTTP and call calculateWhereValue + DB directly,
 * matching exactly what the handler does.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_REQUEST,
  enqueueMedia,
  makeImageMedia,
  makeMedia,
  truncateAll,
} from "./fixtures/helpers";

beforeEach(truncateAll);

// Mirrors the handler's filtered query
async function queryMediaWhere(condition: QueryGroupCondition) {
  const whereClause = calculateWhereValue(condition) ?? undefined;
  return db
    .select({
      id: dbSchema.cacheMedia.id,
      title: dbSchema.cacheMedia.title,
      finderSourceMediaIds: dbSchema.cacheMedia.finderSourceMediaIds,
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
  // Seed via runMediaFinderQuery so groupIds etc are correctly populated
  enqueueMedia([
    makeMedia({ id: "vid-a", title: "Video A", tags: ["cats"] }),
    makeMedia({ id: "vid-b", title: "Video B", tags: ["dogs"] }),
    makeImageMedia({ id: "img-a", title: "Image A", tags: ["cats", "dogs"] }),
    {
      mediaFinderSource: "test-source",
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
  await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST });
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
