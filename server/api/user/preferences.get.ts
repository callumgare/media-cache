import { eq } from "drizzle-orm";

export default defineEventHandler(async () => {
  const row = await db
    .select()
    .from(dbSchema.user)
    .leftJoin(
      dbSchema.userPreferences,
      eq(dbSchema.userPreferences.userId, dbSchema.user.id),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  let prefsRecord = row.user_preferences;

  if (!prefsRecord) {
    const results = await db
      .insert(dbSchema.userPreferences)
      .values({ updatedAt: new Date(), userId: row.user.id })
      .returning();
    if (!results[0]) {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to create user preferences",
      });
    }
    prefsRecord = results[0];
  }

  const { id, createdAt, updatedAt, userId, ...prefs } = prefsRecord;

  return prefs;
});
