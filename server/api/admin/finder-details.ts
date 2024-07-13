import { zodToJsonSchema } from 'zod-to-json-schema'
import { getMediaFinder } from '~/server/lib/media-finder'

export default defineEventHandler(async () => {
  const mediaFinder = await getMediaFinder()
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
  }
})
