import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

async function truncateUsers() {
  await db.execute(
    sql`TRUNCATE TABLE user_preferences, "user" RESTART IDENTITY CASCADE`,
  );
}

async function createTestUser(username = "test-user") {
  const [user] = await db
    .insert(dbSchema.user)
    .values({ username, updatedAt: new Date() })
    .returning();
  return user;
}

/** Replicates the GET /api/user/preferences handler logic */
async function getPreferences() {
  const row = await db
    .select()
    .from(dbSchema.user)
    .leftJoin(
      dbSchema.userPreferences,
      eq(dbSchema.userPreferences.userId, dbSchema.user.id),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) return null;

  let prefs = row.user_preferences;
  if (!prefs) {
    [prefs] = await db
      .insert(dbSchema.userPreferences)
      .values({ updatedAt: new Date(), userId: row.user.id })
      .returning();
  }
  return prefs;
}

type PatchBody = Partial<{
  loopVideo: boolean;
  muteVideo: boolean;
  videoFit: "contain" | "cover";
}>;

/** Replicates the PATCH /api/user/preferences handler logic */
async function patchPreferences(body: PatchBody) {
  const row = await db
    .select()
    .from(dbSchema.user)
    .leftJoin(
      dbSchema.userPreferences,
      eq(dbSchema.userPreferences.userId, dbSchema.user.id),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) throw new Error("User not found");

  let prefs = row.user_preferences;
  if (!prefs) {
    [prefs] = await db
      .insert(dbSchema.userPreferences)
      .values({ updatedAt: new Date(), userId: row.user.id, ...body })
      .returning();
  } else {
    [prefs] = await db
      .update(dbSchema.userPreferences)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(dbSchema.userPreferences.id, prefs.id))
      .returning();
  }
  return prefs;
}

beforeEach(truncateUsers);

describe("GET /api/user/preferences", () => {
  it("returns null when no user exists", async () => {
    const prefs = await getPreferences();
    expect(prefs).toBeNull();
  });

  it("creates default preferences on first call when user has none", async () => {
    await createTestUser();

    const prefs = await getPreferences();

    expect(prefs).not.toBeNull();
    expect(prefs?.loopVideo).toBe(false);
    expect(prefs?.muteVideo).toBe(true);
    expect(prefs?.videoFit).toBe("cover");
  });

  it("returns existing preferences without overwriting them", async () => {
    const user = await createTestUser();
    await db.insert(dbSchema.userPreferences).values({
      userId: user.id,
      loopVideo: true,
      muteVideo: false,
      videoFit: "contain",
      updatedAt: new Date(),
    });

    const prefs = await getPreferences();

    expect(prefs?.loopVideo).toBe(true);
    expect(prefs?.muteVideo).toBe(false);
    expect(prefs?.videoFit).toBe("contain");
  });

  it("only creates one preferences row on repeated calls", async () => {
    await createTestUser();

    await getPreferences();
    await getPreferences();

    const rows = await db.select().from(dbSchema.userPreferences);
    expect(rows).toHaveLength(1);
  });
});

describe("PATCH /api/user/preferences", () => {
  it("creates preferences with patched values when none exist", async () => {
    await createTestUser();

    const prefs = await patchPreferences({ loopVideo: true });

    expect(prefs.loopVideo).toBe(true);
    expect(prefs.muteVideo).toBe(true); // schema default
    expect(prefs.videoFit).toBe("cover"); // schema default
  });

  it("updates a single field without affecting others", async () => {
    await createTestUser();
    await getPreferences(); // create defaults

    const updated = await patchPreferences({ loopVideo: true });

    expect(updated.loopVideo).toBe(true);
    expect(updated.muteVideo).toBe(true); // unchanged
    expect(updated.videoFit).toBe("cover"); // unchanged
  });

  it("updates multiple fields at once", async () => {
    await createTestUser();
    await getPreferences(); // create defaults

    const updated = await patchPreferences({
      loopVideo: true,
      muteVideo: false,
      videoFit: "contain",
    });

    expect(updated.loopVideo).toBe(true);
    expect(updated.muteVideo).toBe(false);
    expect(updated.videoFit).toBe("contain");
  });

  it("persists changes to the database", async () => {
    await createTestUser();
    await patchPreferences({ muteVideo: false, videoFit: "contain" });

    const [saved] = await db.select().from(dbSchema.userPreferences);
    expect(saved.muteVideo).toBe(false);
    expect(saved.videoFit).toBe("contain");
  });

  it("successive patches accumulate correctly", async () => {
    await createTestUser();
    await patchPreferences({ loopVideo: true });
    await patchPreferences({ muteVideo: false });

    const [saved] = await db.select().from(dbSchema.userPreferences);
    expect(saved.loopVideo).toBe(true);
    expect(saved.muteVideo).toBe(false);
  });
});
