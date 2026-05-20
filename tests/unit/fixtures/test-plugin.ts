import type { GenericMedia, Plugin } from "@liase/core";
import { z } from "zod";

declare global {
  var __testPluginQueue: Array<GenericMedia[]>;

  var __testPluginDelayMs: number;

  var __testPageSize: number | undefined;

  // Tracks the page number / cursor of every request made by paginated handlers.
  // Reset this to [] before tests that need to assert on it.
  var __testPluginRequestedPages: Array<{
    pageNumber?: number;
    cursor?: string | number | null;
  }>;

  // Per-page nextCursor values consumed by the cursor-paginated handler.
  // Push the cursor to use as nextCursor for each page in order.
  var __testPluginNextCursors: Array<string | number | null>;
}

export default {
  sources: [
    {
      id: "test-source",
      displayName: "Test Source",
      description: "A controllable source for automated testing",
      requestHandlers: [
        {
          id: "test-handler-with-keyword",
          displayName: "Test Handler With Keyword",
          description: "Like test-handler but with an optional keyword field",
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
              keyword: z.string().optional(),
            })
            .strict(),
          paginationType: "none" as const,
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
                  const delayMs = globalThis.__testPluginDelayMs ?? 0;
                  if (delayMs > 0)
                    await new Promise((resolve) =>
                      setTimeout(resolve, delayMs),
                    );
                  return globalThis.__testPluginQueue?.shift() ?? [];
                },
                request: ($) => $.request,
              },
            },
          ],
        },
        {
          id: "test-handler-with-count",
          displayName: "Test Handler With Count",
          description:
            "Like test-handler but with a count field that has a default value",
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
              count: z.number().default(100),
            })
            .strict(),
          paginationType: "none" as const,
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
                  const delayMs = globalThis.__testPluginDelayMs ?? 0;
                  if (delayMs > 0)
                    await new Promise((resolve) =>
                      setTimeout(resolve, delayMs),
                    );
                  return globalThis.__testPluginQueue?.shift() ?? [];
                },
                request: ($) => $.request,
              },
            },
          ],
        },
        {
          id: "test-handler",
          displayName: "Test Handler",
          description: "Returns media from a programmatic queue",
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
            })
            .strict(),
          paginationType: "none" as const,
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
                  const delayMs = globalThis.__testPluginDelayMs ?? 0;
                  if (delayMs > 0)
                    await new Promise((resolve) =>
                      setTimeout(resolve, delayMs),
                    );
                  return globalThis.__testPluginQueue?.shift() ?? [];
                },
                request: ($) => $.request,
              },
            },
          ],
        },
        {
          id: "test-handler-paginated-offset",
          displayName: "Test Handler (Offset Paginated)",
          description:
            "Offset-paginated handler for testing resume. Each call pops one page from __testPluginQueue. Records requests in __testPluginRequestedPages.",
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
              pageNumber: z.number().default(1),
            })
            .strict(),
          paginationType: "offset" as const,
          responses: [
            {
              schema: z
                .object({
                  media: z.array(z.any()),
                  request: z.any(),
                  page: z.object({
                    paginationType: z.literal("offset"),
                    pageNumber: z.number(),
                    isLastPage: z.boolean(),
                    pageFetchLimitReached: z.boolean(),
                  }),
                })
                .passthrough(),
              constructor: {
                media: async ($) => {
                  if (!globalThis.__testPluginRequestedPages)
                    globalThis.__testPluginRequestedPages = [];
                  globalThis.__testPluginRequestedPages.push({
                    pageNumber: $.request.pageNumber as number,
                  });
                  const delayMs = globalThis.__testPluginDelayMs ?? 0;
                  if (delayMs > 0)
                    await new Promise((resolve) =>
                      setTimeout(resolve, delayMs),
                    );
                  return globalThis.__testPluginQueue?.shift() ?? [];
                },
                request: ($) => $.request,
                page: {
                  paginationType: () => "offset",
                  pageNumber: ($) => $.request.pageNumber,
                  isLastPage: () =>
                    (globalThis.__testPluginQueue?.length ?? 0) === 0,
                  pageFetchLimitReached: ($) =>
                    $.pageFetchLimitReached ?? false,
                },
              },
            },
          ],
        },
        {
          id: "test-handler-paginated-cursor",
          displayName: "Test Handler (Cursor Paginated)",
          description:
            "Cursor-paginated handler for testing resume. Each call pops one page from __testPluginQueue and one nextCursor from __testPluginNextCursors.",
          requestSchema: z
            .object({
              source: z.string(),
              queryType: z.string(),
              cursor: z.union([z.string(), z.number(), z.null()]).default(null),
            })
            .strict(),
          paginationType: "cursor" as const,
          responses: [
            {
              schema: z
                .object({
                  media: z.array(z.any()),
                  request: z.any(),
                  page: z.object({
                    paginationType: z.literal("cursor"),
                    cursor: z.union([z.string(), z.number(), z.null()]),
                    nextCursor: z.union([z.string(), z.number(), z.null()]),
                    isLastPage: z.boolean(),
                    pageFetchLimitReached: z.boolean(),
                  }),
                })
                .passthrough(),
              constructor: {
                media: async ($) => {
                  if (!globalThis.__testPluginRequestedPages)
                    globalThis.__testPluginRequestedPages = [];
                  globalThis.__testPluginRequestedPages.push({
                    cursor: $.request.cursor as string | number | null,
                  });
                  const delayMs = globalThis.__testPluginDelayMs ?? 0;
                  if (delayMs > 0)
                    await new Promise((resolve) =>
                      setTimeout(resolve, delayMs),
                    );
                  return globalThis.__testPluginQueue?.shift() ?? [];
                },
                request: ($) => $.request,
                page: {
                  paginationType: () => "cursor",
                  cursor: ($) => $.request.cursor ?? null,
                  nextCursor: () =>
                    globalThis.__testPluginNextCursors?.shift() ?? null,
                  isLastPage: () =>
                    (globalThis.__testPluginQueue?.length ?? 0) === 0,
                  pageFetchLimitReached: ($) =>
                    $.pageFetchLimitReached ?? false,
                },
              },
            },
          ],
        },
      ],
    },
  ],
} satisfies Plugin;
