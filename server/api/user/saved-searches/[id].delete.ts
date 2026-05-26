import { and, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  if (!id || Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

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

  if (!deleted) {
    throw createError({
      statusCode: 404,
      statusMessage: "Saved search not found",
    });
  }

  return { success: true };
});
