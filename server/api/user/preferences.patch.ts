import { createInsertSchema } from "drizzle-zod";

const PatchSchema = createInsertSchema(dbSchema.userPreferences)
  .partial()
  .omit({ userId: true, createdAt: true, updatedAt: true });

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, PatchSchema.parse);

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const prefsRecord = await db
    .insert(dbSchema.userPreferences)
    .values({ updatedAt: new Date(), userId: user.id, ...body })
    .onConflictDoUpdate({
      target: dbSchema.userPreferences.userId,
      set: { ...body, updatedAt: new Date() },
    })
    .returning()
    .then((rows) => rows[0] ?? null);

  if (!prefsRecord) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to patch user preferences",
    });
  }

  const { id, createdAt, updatedAt, userId, ...prefs } = prefsRecord;

  return prefs;
});
