import { eq, sql } from 'drizzle-orm'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getMediaFinder } from '~/server/lib/media-finder'

export default defineEventHandler(async () => {
  const mediaFinder = await getMediaFinder()
  const groups = await db.select({
    id: dbSchema.group.id,
    name: dbSchema.group.name,
    count: sql`count(*)`,
  })
    .from(dbSchema.group)
    .leftJoin(dbSchema.cacheMediaGroup, eq(dbSchema.cacheMediaGroup.groupId, dbSchema.group.id))
    .orderBy(sql`"count" desc`)
    .groupBy(dbSchema.group.id)
  return {
    sources: Object.fromEntries(
      Object.values(mediaFinder.sources)
        .map(source => [source.id, {
          id: source.id,
          name: source.displayName,
          requestHandlers: source.requestHandlers.map(handler => ({
            id: handler.id,
            name: handler.displayName,
            schema: zodToJsonSchema(handler.requestSchema),
          })),
        }]),
    ),
    groups: groups,
  }
})
