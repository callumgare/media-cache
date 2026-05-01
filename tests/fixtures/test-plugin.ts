import { z } from 'zod'
import type { Plugin, GenericMedia } from 'media-finder'

declare global {
  // eslint-disable-next-line no-var
  var __testPluginQueue: Array<GenericMedia[]>
  // eslint-disable-next-line no-var
  var __testPluginDelayMs: number
}

export default {
  sources: [
    {
      id: 'test-source',
      displayName: 'Test Source',
      description: 'A controllable source for automated testing',
      requestHandlers: [
        {
          id: 'test-handler',
          displayName: 'Test Handler',
          description: 'Returns media from a programmatic queue',
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
            })
            .strict(),
          paginationType: 'none' as const,
          responses: [
            {
              schema: z
                .object({
                  media: z.array(z.any()),
                  request: z.any(),
                })
                .passthrough(),
              constructor: {
                media: async () => {
                  const delayMs = globalThis.__testPluginDelayMs ?? 0
                  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
                  return globalThis.__testPluginQueue?.shift() ?? []
                },
                request: $ => $.request,
              },
            },
          ],
        },
      ],
    },
  ],
} satisfies Plugin
