import { zodToJsonSchema } from 'zod-to-json-schema'
import { getMediaFinder } from '~/server/lib/media-finder'

export default defineEventHandler(async () => {
  const mediaFinder = await getMediaFinder()
  const groups = await db.query.group.findMany({ columns: { name: true, id: true } })
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
    groups: groups.toSorted((a, b) => a.name.localeCompare(b.name)),
  }
})
