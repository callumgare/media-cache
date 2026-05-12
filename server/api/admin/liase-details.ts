import { getLiase } from "@@/server/lib/liase";
import { sql } from "drizzle-orm";

export default defineEventHandler(async () => {
  const liase = await getLiase();
  const tags = await db
    .select({
      id: dbSchema.group.id,
      name: dbSchema.group.name,
      count: sql<number>`(
      SELECT count(*) FROM cache_media
      WHERE EXISTS (
        SELECT 1
        FROM unnest(cache_media.group_ids) AS k
        WHERE k::int = ${dbSchema.group.id}
      )
    )`,
    })
    .from(dbSchema.group)
    .orderBy(dbSchema.group.name)
    .groupBy(dbSchema.group.id);
  return {
    sources: Object.fromEntries(
      Object.values(liase.sources).map((source) => [
        source.id,
        {
          id: source.id,
          name: source.displayName,
          requestHandlers: source.requestHandlers.map((handler) => ({
            id: handler.id,
            name: handler.displayName,
            schema: handler.requestSchema.toJSONSchema({
              unrepresentable: "any",
            }),
          })),
        },
      ]),
    ),
    tags: tags,
  };
});
