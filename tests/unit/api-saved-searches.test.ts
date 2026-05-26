import { db, dbSchema } from "@@/server/utils/drizzle";
import type { QueryConditionFlatNode } from "@@/types/query-condition";
import type { WidgetId } from "@@/types/query-field-type-definitions";
import type { SortConfig } from "@@/types/sort-config";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

// ── Helpers ────────────────────────────────────────────────────────────────

async function truncate() {
  await db.execute(
    sql`TRUNCATE TABLE saved_search, user_preferences, "user" RESTART IDENTITY CASCADE`,
  );
}

async function createTestUser(username = "test-user") {
  const [user] = await db
    .insert(dbSchema.user)
    .values({ username, updatedAt: new Date() })
    .returning();
  if (!user) throw new Error("Failed to create test user");
  return user;
}

// Minimal valid fixtures
const MINIMAL_NODES: QueryConditionFlatNode[] = [
  { id: 1, type: "group", operator: "AND", parent: null },
];
const RANDOM_SORT: SortConfig = { field: "random" };
const DATE_SORT: SortConfig = {
  field: "createdOrUploadedAt",
  direction: "desc",
};

// The helpers below replicate the handler logic so we test the DB behaviour
// directly (same pattern as api-user-preferences.test.ts).

/** GET /api/user/saved-searches */
async function getSavedSearches() {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  return db
    .select()
    .from(dbSchema.savedSearch)
    .where(eq(dbSchema.savedSearch.userId, user.id))
    .orderBy(dbSchema.savedSearch.createdAt);
}

type CreateBody = {
  name: string;
  conditionNodes: QueryConditionFlatNode[];
  sort: SortConfig;
  widgetOverrides?: Record<number, WidgetId>;
};

/** POST /api/user/saved-searches */
async function createSavedSearch(body: CreateBody) {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  const [result] = await db
    .insert(dbSchema.savedSearch)
    .values({
      updatedAt: new Date(),
      userId: user.id,
      name: body.name,
      conditionNodes: body.conditionNodes,
      sort: body.sort,
      widgetOverrides: body.widgetOverrides ?? {},
    })
    .returning();
  if (!result) throw new Error("Failed to create saved search");
  return result;
}

type PatchBody = Partial<{
  name: string;
  conditionNodes: QueryConditionFlatNode[];
  sort: SortConfig;
  widgetOverrides: Record<number, WidgetId>;
}>;

/** PATCH /api/user/saved-searches/[id] */
async function patchSavedSearch(id: number, body: PatchBody) {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  const result = await db
    .update(dbSchema.savedSearch)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(
        eq(dbSchema.savedSearch.id, id),
        eq(dbSchema.savedSearch.userId, user.id),
      ),
    )
    .returning()
    .then((rows) => rows[0] ?? null);

  if (!result) throw Object.assign(new Error("Not found"), { status: 404 });

  return result;
}

/** DELETE /api/user/saved-searches/[id] */
async function deleteSavedSearch(id: number) {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  const deleted = await db
    .delete(dbSchema.savedSearch)
    .where(
      and(
        eq(dbSchema.savedSearch.id, id),
        eq(dbSchema.savedSearch.userId, user.id),
      ),
    )
    .returning()
    .then((rows) => rows[0] ?? null);

  if (!deleted) throw Object.assign(new Error("Not found"), { status: 404 });

  return deleted;
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(truncate);

// ── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/user/saved-searches", () => {
  it("throws 404 when no user exists", async () => {
    await expect(getSavedSearches()).rejects.toMatchObject({ status: 404 });
  });

  it("returns an empty array when the user has no saved searches", async () => {
    await createTestUser();
    const results = await getSavedSearches();
    expect(results).toEqual([]);
  });

  it("returns all saved searches belonging to the user", async () => {
    await createTestUser();
    await createSavedSearch({
      name: "Alpha",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });
    await createSavedSearch({
      name: "Beta",
      conditionNodes: MINIMAL_NODES,
      sort: DATE_SORT,
    });

    const results = await getSavedSearches();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("returns searches ordered by creation date ascending", async () => {
    await createTestUser();
    await createSavedSearch({
      name: "First",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });
    await createSavedSearch({
      name: "Second",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });
    await createSavedSearch({
      name: "Third",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    const results = await getSavedSearches();
    expect(results.map((r) => r.name)).toEqual(["First", "Second", "Third"]);
  });
});

// ── POST ───────────────────────────────────────────────────────────────────

describe("POST /api/user/saved-searches", () => {
  it("throws 404 when no user exists", async () => {
    await expect(
      createSavedSearch({
        name: "Test",
        conditionNodes: MINIMAL_NODES,
        sort: RANDOM_SORT,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("creates a saved search and returns it with an id", async () => {
    await createTestUser();
    const result = await createSavedSearch({
      name: "My Search",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    expect(result.id).toBeTypeOf("number");
    expect(result.name).toBe("My Search");
  });

  it("persists conditionNodes accurately", async () => {
    await createTestUser();
    const nodes: QueryConditionFlatNode[] = [
      { id: 1, type: "group", operator: "AND", parent: null },
      {
        id: 2,
        type: "field",
        field: "tags",
        operator: "includes all",
        value: [1, 2],
        parent: 1,
      },
    ];
    const result = await createSavedSearch({
      name: "With fields",
      conditionNodes: nodes,
      sort: RANDOM_SORT,
    });

    expect(result.conditionNodes).toEqual(nodes);
  });

  it("persists sort accurately", async () => {
    await createTestUser();
    const result = await createSavedSearch({
      name: "Sorted",
      conditionNodes: MINIMAL_NODES,
      sort: DATE_SORT,
    });

    expect(result.sort).toEqual(DATE_SORT);
  });

  it("persists widgetOverrides when provided", async () => {
    await createTestUser();
    const overrides: Record<number, WidgetId> = { 2: "listbox" };
    const result = await createSavedSearch({
      name: "With overrides",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
      widgetOverrides: overrides,
    });

    expect(result.widgetOverrides).toEqual(overrides);
  });

  it("defaults widgetOverrides to {} when not provided", async () => {
    await createTestUser();
    const result = await createSavedSearch({
      name: "No overrides",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    expect(result.widgetOverrides).toEqual({});
  });

  it("is visible in the database after creation", async () => {
    await createTestUser();
    const created = await createSavedSearch({
      name: "Persisted",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    const [row] = await db
      .select()
      .from(dbSchema.savedSearch)
      .where(eq(dbSchema.savedSearch.id, created.id));
    expect(row?.name).toBe("Persisted");
  });
});

// ── PATCH ──────────────────────────────────────────────────────────────────

describe("PATCH /api/user/saved-searches/[id]", () => {
  it("throws 404 when no user exists", async () => {
    await expect(patchSavedSearch(999, { name: "New" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the saved search does not exist", async () => {
    await createTestUser();
    await expect(patchSavedSearch(999, { name: "New" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("updates only the name when only name is patched", async () => {
    await createTestUser();
    const { id } = await createSavedSearch({
      name: "Original",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    const updated = await patchSavedSearch(id, { name: "Renamed" });

    expect(updated.name).toBe("Renamed");
    expect(updated.conditionNodes).toEqual(MINIMAL_NODES);
    expect(updated.sort).toEqual(RANDOM_SORT);
  });

  it("updates only conditionNodes when only conditionNodes is patched", async () => {
    await createTestUser();
    const { id, name } = await createSavedSearch({
      name: "Search",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });
    const newNodes: QueryConditionFlatNode[] = [
      { id: 1, type: "group", operator: "OR", parent: null },
    ];

    const updated = await patchSavedSearch(id, { conditionNodes: newNodes });

    expect(updated.conditionNodes).toEqual(newNodes);
    expect(updated.name).toBe(name);
  });

  it("updates only sort when only sort is patched", async () => {
    await createTestUser();
    const { id } = await createSavedSearch({
      name: "Search",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    const updated = await patchSavedSearch(id, { sort: DATE_SORT });

    expect(updated.sort).toEqual(DATE_SORT);
    expect(updated.conditionNodes).toEqual(MINIMAL_NODES);
  });

  it("updates widgetOverrides", async () => {
    await createTestUser();
    const { id } = await createSavedSearch({
      name: "Search",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });
    const overrides: Record<number, WidgetId> = { 2: "listbox" };

    const updated = await patchSavedSearch(id, { widgetOverrides: overrides });

    expect(updated.widgetOverrides).toEqual(overrides);
  });

  it("cannot patch a saved search belonging to another user", async () => {
    // First user is picked by the helper (first row in DB)
    await createTestUser("user-1");
    const [user2patch] = await db
      .insert(dbSchema.user)
      .values({ username: "user-2", updatedAt: new Date() })
      .returning();
    if (!user2patch) throw new Error("Expected user-2 row");

    const [search] = await db
      .insert(dbSchema.savedSearch)
      .values({
        userId: user2patch.id,
        name: "User2 Search",
        conditionNodes: MINIMAL_NODES,
        sort: RANDOM_SORT,
        widgetOverrides: {},
        updatedAt: new Date(),
      })
      .returning();

    await expect(
      patchSavedSearch(search?.id, { name: "Hijacked" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /api/user/saved-searches/[id]", () => {
  it("throws 404 when no user exists", async () => {
    await expect(deleteSavedSearch(999)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when the saved search does not exist", async () => {
    await createTestUser();
    await expect(deleteSavedSearch(999)).rejects.toMatchObject({ status: 404 });
  });

  it("deletes the saved search and returns it", async () => {
    await createTestUser();
    const { id } = await createSavedSearch({
      name: "To Delete",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    const deleted = await deleteSavedSearch(id);
    expect(deleted.id).toBe(id);
  });

  it("removes the row from the database", async () => {
    await createTestUser();
    const { id } = await createSavedSearch({
      name: "Gone",
      conditionNodes: MINIMAL_NODES,
      sort: RANDOM_SORT,
    });

    await deleteSavedSearch(id);

    const rows = await db
      .select()
      .from(dbSchema.savedSearch)
      .where(eq(dbSchema.savedSearch.id, id));
    expect(rows).toHaveLength(0);
  });

  it("cannot delete a saved search belonging to another user", async () => {
    await createTestUser("user-1");
    const [user2delete] = await db
      .insert(dbSchema.user)
      .values({ username: "user-2", updatedAt: new Date() })
      .returning();
    if (!user2delete) throw new Error("Expected user-2 row");

    const [search] = await db
      .insert(dbSchema.savedSearch)
      .values({
        userId: user2delete.id,
        name: "User2 Search",
        conditionNodes: MINIMAL_NODES,
        sort: RANDOM_SORT,
        widgetOverrides: {},
        updatedAt: new Date(),
      })
      .returning();

    await expect(deleteSavedSearch(search?.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
