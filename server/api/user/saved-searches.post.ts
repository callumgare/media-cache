import { queryConditionFlatNodeSchema } from "@@/types/query-condition";
import { widgetIdSchema } from "@@/types/query-field-type-definitions";
import { sortConfigSchema } from "@@/types/sort-config";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1),
  conditionNodes: z.array(queryConditionFlatNodeSchema),
  sort: sortConfigSchema,
  widgetOverrides: z.record(z.coerce.number(), widgetIdSchema).default({}),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, CreateSchema.parse);

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const existing = await db
    .select({ id: dbSchema.savedSearch.id })
    .from(dbSchema.savedSearch)
    .where(
      and(
        eq(dbSchema.savedSearch.userId, user.id),
        eq(dbSchema.savedSearch.name, body.name),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: "A saved search with that name already exists.",
    });
  }

  const result = await db
    .insert(dbSchema.savedSearch)
    .values({
      updatedAt: new Date(),
      userId: user.id,
      name: body.name,
      conditionNodes: body.conditionNodes,
      sort: body.sort,
      widgetOverrides: body.widgetOverrides,
    })
    .returning()
    .then((rows) => rows[0] ?? null);

  if (!result) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create saved search",
    });
  }

  return result;
});
