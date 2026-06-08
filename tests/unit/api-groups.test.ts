import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import groupsHandler from "@@/server/api/groups.get";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { createEvent } from "h3";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./fixtures/helpers";

beforeEach(truncateAll);

async function callHandler(query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const req = new IncomingMessage(new Socket());
  req.url = `/api/groups${qs ? `?${qs}` : ""}`;
  req.method = "GET";
  const event = createEvent(req, new ServerResponse(req));
  return groupsHandler(event);
}

async function insertGroup(name: string, parentId?: number) {
  const [row] = await db
    .insert(dbSchema.group)
    .values({ name, parentId: parentId ?? null, updatedAt: new Date() })
    .returning();
  if (!row) throw new Error(`Failed to insert group: ${name}`);
  return row;
}

async function insertMedia(groupIds: number[]) {
  const [row] = await db
    .insert(dbSchema.cacheMedia)
    .values({
      lastIndexedAt: new Date(),
      groupIds: groupIds,
    })
    .returning();
  if (!row) throw new Error("Failed to insert media");
  return row;
}

/**
 * Seed top-level groups with controlled subgroup/media counts:
 *
 *   Group A — 0 subgroups, 0 media  (total: 0)
 *   Group B — 2 subgroups, 1 media  (total: 3)
 *   Group C — 1 subgroup,  3 media  (total: 4)
 *   Group D — 0 subgroups, 4 media  (total: 4)
 */
async function seedGroups() {
  const a = await insertGroup("Group A");
  const b = await insertGroup("Group B");
  const c = await insertGroup("Group C");
  const d = await insertGroup("Group D");

  // Subgroups of B
  await insertGroup("B-sub-1", b.id);
  await insertGroup("B-sub-2", b.id);

  // Subgroup of C
  await insertGroup("C-sub-1", c.id);

  // Media
  await insertMedia([b.id]);
  await insertMedia([c.id]);
  await insertMedia([c.id]);
  await insertMedia([c.id]);
  await insertMedia([d.id]);
  await insertMedia([d.id]);
  await insertMedia([d.id]);
  await insertMedia([d.id]);

  return { a, b, c, d };
}

describe("/api/groups — sort=name", () => {
  it("returns top-level groups in ascending alphabetical order", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "name", dir: "asc" });
    const names = result.groups.map((g) => g.name);
    expect(names).toEqual(["Group A", "Group B", "Group C", "Group D"]);
  });

  it("returns top-level groups in descending alphabetical order", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "name", dir: "desc" });
    const names = result.groups.map((g) => g.name);
    expect(names).toEqual(["Group D", "Group C", "Group B", "Group A"]);
  });
});

describe("/api/groups — sort=subgroups", () => {
  it("returns groups sorted by subgroup count descending, then name", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "subgroups" });
    const names = result.groups.map((g) => g.name);
    // B=2, C=1, A=0, D=0 → ties broken by name
    expect(names).toEqual(["Group B", "Group C", "Group A", "Group D"]);
  });

  it("includes correct subgroupCount on each group", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "subgroups" });
    const byName = Object.fromEntries(
      result.groups.map((g) => [g.name, g.subgroupCount]),
    );
    expect(byName["Group A"]).toBe(0);
    expect(byName["Group B"]).toBe(2);
    expect(byName["Group C"]).toBe(1);
    expect(byName["Group D"]).toBe(0);
  });
});

describe("/api/groups — sort=media", () => {
  it("returns groups sorted by media count descending, then name", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "media" });
    const names = result.groups.map((g) => g.name);
    // D=4, C=3, B=1, A=0
    expect(names).toEqual(["Group D", "Group C", "Group B", "Group A"]);
  });

  it("includes correct mediaCount on each group", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "media" });
    const byName = Object.fromEntries(
      result.groups.map((g) => [g.name, g.mediaCount]),
    );
    expect(byName["Group A"]).toBe(0);
    expect(byName["Group B"]).toBe(1);
    expect(byName["Group C"]).toBe(3);
    expect(byName["Group D"]).toBe(4);
  });
});

describe("/api/groups — sort=total (default)", () => {
  it("returns groups sorted by subgroups+media count descending, then name", async () => {
    await seedGroups();
    const result = await callHandler({ sort: "total" });
    const names = result.groups.map((g) => g.name);
    // C=1+3=4, D=0+4=4 (tie → name), B=2+1=3, A=0
    expect(names).toEqual(["Group C", "Group D", "Group B", "Group A"]);
  });

  it("uses total sort when no sort param is provided", async () => {
    await seedGroups();
    const withDefault = await callHandler();
    const withExplicit = await callHandler({ sort: "total" });
    expect(withDefault.groups.map((g) => g.name)).toEqual(
      withExplicit.groups.map((g) => g.name),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/groups — subgroupCount and mediaCount fields on list results
// ---------------------------------------------------------------------------

describe("GET /api/groups — subgroupCount field", () => {
  it("is 0 for a group with no children", async () => {
    const { a } = await seedGroups();
    const result = await callHandler({ parentId: "null", sort: "name" });
    const aGroup = result.groups.find((g) => g.id === a.id);
    expect(aGroup?.subgroupCount).toBe(0);
  });

  it("counts direct child groups correctly", async () => {
    const { b } = await seedGroups();
    // Group B has 2 direct children
    const result = await callHandler({ parentId: "null", sort: "name" });
    const bGroup = result.groups.find((g) => g.id === b.id);
    expect(bGroup?.subgroupCount).toBe(2);
  });
});

describe("GET /api/groups — mediaCount field", () => {
  it("is 0 for a group with no media", async () => {
    const { a } = await seedGroups();
    const result = await callHandler({ parentId: "null", sort: "name" });
    const aGroup = result.groups.find((g) => g.id === a.id);
    expect(aGroup?.mediaCount).toBe(0);
  });

  it("counts media items belonging to the group correctly", async () => {
    const { c } = await seedGroups();
    // Group C has 3 media items
    const result = await callHandler({ parentId: "null", sort: "name" });
    const cGroup = result.groups.find((g) => g.id === c.id);
    expect(cGroup?.mediaCount).toBe(3);
  });
});
