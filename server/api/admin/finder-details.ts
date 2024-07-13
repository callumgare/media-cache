import { MediaFinder } from 'media-finder'
import { zodToJsonSchema } from 'zod-to-json-schema'

export default defineEventHandler(async () => {
  const mediaFinder = new MediaFinder()
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
