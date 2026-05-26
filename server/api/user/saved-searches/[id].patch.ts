import { queryConditionFlatNodeSchema } from "@@/types/query-condition";
import { widgetIdSchema } from "@@/types/query-field-type-definitions";
import { sortConfigSchema } from "@@/types/sort-config";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  conditionNodes: z.array(queryConditionFlatNodeSchema).optional(),
  sort: sortConfigSchema.optional(),
  widgetOverrides: z.record(z.coerce.number(), widgetIdSchema).optional(),
});

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  if (!id || Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }

  const body = await readValidatedBody(event, PatchSchema.parse);

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

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

  if (!result) {
    throw createError({
      statusCode: 404,
      statusMessage: "Saved search not found",
    });
  }

  return result;
});
