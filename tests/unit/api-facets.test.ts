import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import mediaFacetsHandler from "@@/server/api/media-facets";
import { fetchFieldCounts } from "@@/server/lib/media-facets";
import { db } from "@@/server/utils/drizzle";
import type {
  FacetFieldResult,
  SourceFacetCount,
  TagFacetCount,
  TypeFacetCount,
} from "@@/types/api-media-facets";
import type {
  QueryFieldCondition,
  QueryGroupCondition,
} from "@@/types/query-condition";
import { createEvent } from "h3";
/**
 * Tests for /api/media-facets facet count logic.
 * We call server/lib/media-facets directly rather than going through HTTP,
 * so we exercise exactly the same queries as the API handler.
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

function makeBody(
  conditions: QueryGroupCondition["conditions"] = [],
): QueryGroupCondition {
  return { id: 1, type: "group", operator: "AND", conditions };
}

function makeSourceCondition(
  value = "",
): QueryFieldCondition & { field: "source" } {
  return { id: 10, type: "field", field: "source", operator: "equals", value };
}

function makeTagCondition(
  value: number[] = [],
): QueryFieldCondition & { field: "tags" } {
  return {
    id: 20,
    type: "field",
    field: "tags",
    operator: "includes all",
    value,
  };
}

function makeTypeCondition(
  value = "",
): QueryFieldCondition & { field: "type" } {
  return { id: 30, type: "field", field: "type", operator: "equals", value };
}

async function getGroupId(name: string): Promise<number> {
  const g = await db.query.group.findFirst({
    where: (g, { eq }) => eq(g.name, name),
  });
  if (!g) throw new Error(`Group not found: ${name}`);
  return g.id;
}

async function seedMedia() {
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

describe("/api/media-facets — source counts", () => {
  it("counts all media per source when no source filter is active", async () => {
    await seedMedia();
    const cond = makeSourceCondition();
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    expect(counts).toHaveLength(1);
    expect(counts[0].liaseSourceId).toBe("test-source");
    expect(counts[0].count).toBe(4);
  });

  it("source counts ignore the active source filter (shows totals per source)", async () => {
    await seedMedia();
    const cond = makeSourceCondition("test-source");
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    // blanked source condition → shows all 4 for test-source
    expect(counts[0].count).toBe(4);
  });

  it("source counts respect other active filters (type)", async () => {
    await seedMedia();
    const sourceCond = makeSourceCondition();
    const typeCond = makeTypeCondition("image");
    const body = makeBody([sourceCond, typeCond]);
    const counts = await fetchFieldCounts(sourceCond, body);
    // type=image is active; source=image filtered to 1 (img-a)
    expect(counts[0].count).toBe(1);
  });
});

describe("/api/media-facets — tag counts", () => {
  it("counts media per tag when no tag filter is active", async () => {
    await seedMedia();
    const cond = makeTagCondition([]);
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const byName = Object.fromEntries(counts.map((c) => [c.name, c.count]));
    // cats: vid-a + img-a = 2
    expect(byName.cats).toBe(2);
    // dogs: vid-b + img-a = 2
    expect(byName.dogs).toBe(2);
  });

  it("includes-all: active tag filter limits counts shown", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const cond = makeTagCondition([catsId]);
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const byName = Object.fromEntries(counts.map((c) => [c.name, c.count]));
    // With cats selected, baseWhere keeps the cats filter active:
    // cats: 2 (vid-a, img-a), dogs: 1 (img-a — only media with cats that also has dogs)
    expect(byName.cats).toBe(2);
    expect(byName.dogs).toBe(1);
  });

  it("countAddedIfRemoved is null when tag is not selected", async () => {
    await seedMedia();
    const cond = makeTagCondition([]);
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    for (const c of counts) {
      expect(c.countAddedIfRemoved).toBeNull();
    }
  });

  it("countAddedIfRemoved shows how many items would be added back if the tag were removed", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const cond = makeTagCondition([catsId]);
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const catsFacet = counts.find((c) => c.name === "cats");
    if (!catsFacet) throw new Error("Expected to find a cats facet in counts");
    // Removing cats: 4 total vs 2 with cats selected → countAddedIfRemoved = 2
    expect(catsFacet.countAddedIfRemoved).toBe(2);
  });

  it("countAddedIfRemoved=0 when removing the tag adds no extra items", async () => {
    // Seed only media with cats, so removing cats doesn't expose new items
    enqueueMedia([makeMedia({ id: "only-cats", tags: ["cats"] })]);
    await runLiaseQuery();

    const catsId = await getGroupId("cats");
    const cond = makeTagCondition([catsId]);
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const catsFacet = counts.find((c) => c.name === "cats");
    if (!catsFacet) throw new Error("Expected to find a cats facet in counts");
    // All media has cats; removing cats still gives the same count (just without filter) → 0 added
    expect(catsFacet.countAddedIfRemoved).toBe(0);
  });

  it("tag counts respect other active filters (type)", async () => {
    await seedMedia();
    const cond = makeTagCondition([]);
    const typeCond = makeTypeCondition("image");
    const body = makeBody([cond, typeCond]);
    const counts = await fetchFieldCounts(cond, body);
    const byName = Object.fromEntries(counts.map((c) => [c.name, c.count]));
    // With type=image, only img-a qualifies → cats:1, dogs:1
    expect(byName.cats).toBe(1);
    expect(byName.dogs).toBe(1);
  });
});

describe("/api/media-facets — type counts", () => {
  it("counts all type buckets correctly", async () => {
    await seedMedia();
    const cond = makeTypeCondition();
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const byType = Object.fromEntries(counts.map((c) => [c.value, c.count]));
    // vid-a, vid-b, vid-c are videos; img-a is image
    expect(byType.video).toBe(3);
    expect(byType.image).toBe(1);
    expect(byType["video-with-audio"]).toBe(1); // vid-c
    expect(byType["video-without-audio"]).toBe(2); // vid-a, vid-b
  });

  it("type counts are zero when no media exists", async () => {
    const cond = makeTypeCondition();
    const counts = await fetchFieldCounts(cond, makeBody([cond]));
    const byType = Object.fromEntries(counts.map((c) => [c.value, c.count]));
    expect(byType.video).toBe(0);
    expect(byType.image).toBe(0);
    expect(byType["video-with-audio"]).toBe(0);
    expect(byType["video-without-audio"]).toBe(0);
  });

  it("type counts respect other active filters (tag)", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const typeCond = makeTypeCondition();
    const tagCond = makeTagCondition([catsId]);
    const body = makeBody([typeCond, tagCond]);
    const counts = await fetchFieldCounts(typeCond, body);
    const byType = Object.fromEntries(counts.map((c) => [c.value, c.count]));
    // With cats filter: vid-a (video, no audio) + img-a (image) → blanked type, still cats active
    // type cond is blanked, tag cond is kept
    expect(byType.video).toBe(1); // vid-a
    expect(byType.image).toBe(1); // img-a
  });

  it("type counts ignore the active type filter itself", async () => {
    await seedMedia();
    const cond = makeTypeCondition("image");
    const body = makeBody([cond]);
    const counts = await fetchFieldCounts(cond, body);
    const byType = Object.fromEntries(counts.map((c) => [c.value, c.count]));
    // Blanked type condition → counts over all media
    expect(byType.video).toBe(3);
    expect(byType.image).toBe(1);
  });
});

describe("/api/media-facets — cross-field interactions", () => {
  it("source count drops when tag filter reduces visible set", async () => {
    await seedMedia();
    const catsId = await getGroupId("cats");
    const sourceCond = makeSourceCondition();
    const tagCond = makeTagCondition([catsId]);
    const body = makeBody([sourceCond, tagCond]);
    const counts = await fetchFieldCounts(sourceCond, body);
    // tag filter keeps 2 items (vid-a, img-a); source cond blanked but tag kept
    expect(counts[0].count).toBe(2);
  });

  it("tag counts drop when type filter reduces visible set", async () => {
    await seedMedia();
    const typeCond = makeTypeCondition("video-without-audio");
    const tagCond = makeTagCondition([]);
    const body = makeBody([typeCond, tagCond]);
    const counts = await fetchFieldCounts(tagCond, body);
    const byName = Object.fromEntries(counts.map((c) => [c.name, c.count]));
    // Only vid-a (cats) and vid-b (dogs) are video-without-audio
    expect(byName.cats).toBe(1);
    expect(byName.dogs).toBe(1);
    expect(byName.image).toBeUndefined();
  });
});

describe("/api/media-facets — all filters populated", () => {
  async function callHandler(body: QueryGroupCondition) {
    const req = new IncomingMessage(new Socket());
    req.method = "POST";
    const event = createEvent(req, new ServerResponse(req));
    // Provide the body directly since readBody reads from the event's _data in h3
    event._requestBody = JSON.stringify(body);
    return mediaFacetsHandler(event);
  }

  it("source, tags, and type facets all return populated options when media exists", async () => {
    enqueueMedia([
      makeMedia({ id: "vid-a", tags: ["cats"] }),
      makeMedia({ id: "vid-b", tags: ["dogs"] }),
      makeImageMedia({ id: "img-a", tags: ["cats", "dogs"] }),
    ]);
    await runLiaseQuery();

    const body = makeBody([
      makeSourceCondition(),
      makeTagCondition([]),
      makeTypeCondition(),
    ]);
    const result = await callHandler(body);

    expect(result.type).toBe("group");
    if (result.type !== "group") return;

    const byField = Object.fromEntries(
      result.conditions
        .filter((c): c is FacetFieldResult => c.type === "field")
        .map((c) => [c.field, c.counts]),
    );

    // Source filter: test-source appears and has a display name
    const sourceCounts = byField.source as SourceFacetCount[];
    expect(sourceCounts).toHaveLength(1);
    expect(sourceCounts[0].liaseSourceId).toBe("test-source");
    expect(sourceCounts[0].name).toBe("Test Source");
    expect(sourceCounts[0].count).toBe(3);

    // Tags filter: cats and dogs both appear
    const tagCounts = byField.tags as TagFacetCount[];
    expect(tagCounts.length).toBeGreaterThanOrEqual(2);
    const tagNames = tagCounts.map((t) => t.name);
    expect(tagNames).toContain("cats");
    expect(tagNames).toContain("dogs");
    for (const tag of tagCounts) expect(tag.count).toBeGreaterThan(0);

    // Type filter: video and image both appear
    const typeCounts = byField.type as TypeFacetCount[];
    const typeValues = typeCounts.map((t) => t.value);
    expect(typeValues).toContain("video");
    expect(typeValues).toContain("image");
    const byType = Object.fromEntries(
      typeCounts.map((t) => [t.value, t.count]),
    );
    expect(byType.video).toBe(2);
    expect(byType.image).toBe(1);
  });
});
