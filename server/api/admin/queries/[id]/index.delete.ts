import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  const id = Number.parseInt(idParam || "", 10);
  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid query ID" });
  }
  const result = await db
    .delete(dbSchema.finderQuery)
    .where(eq(dbSchema.finderQuery.id, id));
  return result;
});
