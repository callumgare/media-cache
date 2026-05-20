import { eq, isNotNull } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  const id = Number.parseInt(idParam || "", 10);
  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid secret ID" });
  }

  // Check if any queries reference this secret in their secretMappings
  const queriesWithMappings = await db.query.liaseQuery.findMany({
    where: isNotNull(dbSchema.liaseQuery.secretMappings),
    columns: { id: true, title: true, secretMappings: true },
  });
  const referencingQuery = queriesWithMappings.find(
    (q) => q.secretMappings && Object.values(q.secretMappings).includes(id),
  );
  if (referencingQuery) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete: secret is used by query "${referencingQuery.title}" (ID ${referencingQuery.id}). Remove it from the query first.`,
    });
  }

  const deleted = await db
    .delete(dbSchema.querySecret)
    .where(eq(dbSchema.querySecret.id, id))
    .returning({ id: dbSchema.querySecret.id });

  if (deleted.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `Secret with ID ${id} not found`,
    });
  }

  return { success: true };
});
