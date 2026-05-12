import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import type { GenericMedia } from "@liase/core";
import { sql } from "drizzle-orm";

declare global {
  var __testPluginQueue: Array<GenericMedia[]>;
  var __testPluginDelayMs: number;
}

/**
 * Test-only endpoint. Resets the DB and optionally seeds the test plugin queue.
 * Only available when ENABLE_TEST_API=true.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.ENABLE_TEST_API) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  const body = (await readBody(event)) as {
    media?: GenericMedia[][];
    delay?: number;
  };

  // Truncate all test-relevant tables. Retry on lock conflicts caused by
  // in-flight server-side queries from a previous test.
  const truncate = () =>
    db.execute(sql`
    TRUNCATE TABLE
      liase_query_media,
      liase_query_media_content,
      liase_query_execution,
      liase_query_execution_log,
      liase_query,
      deleted_cache_media,
      cache_media,
      "group",
      source
    CASCADE
  `);

  for (let attempt = 0; ; attempt++) {
    try {
      await truncate();
      break;
    } catch (err) {
      if (attempt >= 9) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Clear any in-memory running states from previous tests
  queryExecutionTaskSystem.clearInMemoryTasks();

  // Seed the test plugin queue
  globalThis.__testPluginQueue = body.media ?? [];
  globalThis.__testPluginDelayMs = body.delay ?? 0;

  return { ok: true };
});
