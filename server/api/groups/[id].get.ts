import { db, dbSchema } from "@@/server/utils/drizzle";
import { count, eq, sql } from "drizzle-orm";
import { createError, defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const idParam = event.context.params?.id ?? "";
  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid group ID" });
  }

  const [group, childCountResult, mediaCountResult, ancestorRows] =
    await Promise.all([
      db
        .select()
        .from(dbSchema.group)
        .where(eq(dbSchema.group.id, id))
        .limit(1)
        .then((r) => r[0]),
      db
        .select({ childGroupCount: count() })
        .from(dbSchema.group)
        .where(eq(dbSchema.group.parentId, id)),
      db
        .select({ mediaCount: count() })
        .from(dbSchema.cacheMedia)
        .where(sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${id}]::integer[]`),
      // Drizzle doesn't yet support WITH RECURSIVE https://github.com/drizzle-team/drizzle-orm/issues/209
      db.execute<{ id: number; name: string }>(sql`
      WITH RECURSIVE ancestors(id, name, "parent_id", depth) AS (
        SELECT id, name, "parent_id", 1
        FROM "group"
        WHERE id = (SELECT "parent_id" FROM "group" WHERE id = ${id})
        UNION ALL
        SELECT g.id, g.name, g."parent_id", a.depth + 1
        FROM "group" g
        INNER JOIN ancestors a ON g.id = a."parent_id"
      )
      SELECT id, name FROM ancestors ORDER BY depth DESC
    `),
    ]);

  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }

  return {
    ...group,
    childGroupCount: childCountResult[0]?.childGroupCount ?? 0,
    mediaCount: mediaCountResult[0]?.mediaCount ?? 0,
    ancestors: Array.from(ancestorRows).map((r) => ({
      id: r.id,
      name: r.name,
    })),
  };
});
