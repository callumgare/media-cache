import { sql } from 'drizzle-orm'
import type { GenericMedia } from 'media-finder'
import { queryExecutionTaskSystem } from '@/server/lib/media-finder/execution-tasks'

declare global {
  // eslint-disable-next-line no-var
  var __testPluginQueue: Array<GenericMedia[]>
}

/**
 * Test-only endpoint. Resets the DB and optionally seeds the test plugin queue.
 * Only available when ENABLE_TEST_API=true.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.ENABLE_TEST_API) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const body = await readBody(event) as { media?: GenericMedia[][], delay?: number }

  // Truncate all test-relevant tables
  await db.execute(sql`
    TRUNCATE TABLE
      finder_query_media,
      finder_query_media_content,
      finder_query_execution,
      finder_query_execution_log,
      finder_query,
      deleted_cache_media,
      cache_media,
      "group",
      source
    CASCADE
  `)

  // Clear any in-memory running states from previous tests
  queryExecutionTaskSystem.clearRunningStates()

  // Seed the test plugin queue
  globalThis.__testPluginQueue = body.media ?? []
  globalThis.__testPluginDelayMs = body.delay ?? 0

  return { ok: true }
})
