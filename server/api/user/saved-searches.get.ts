import { eq } from "drizzle-orm";

export default defineEventHandler(async () => {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  return db
    .select()
    .from(dbSchema.savedSearch)
    .where(eq(dbSchema.savedSearch.userId, user.id))
    .orderBy(dbSchema.savedSearch.createdAt);
});
