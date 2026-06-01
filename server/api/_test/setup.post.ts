import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import type { GenericMedia } from "@liase/core";
import { sql } from "drizzle-orm";

declare global {
  var __testPluginQueue: Array<GenericMedia[]>;
  var __testPluginDelayMs: number;
  var __testPageSize: number | undefined;
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
    pageSize?: number;
    groups?: Array<{ name: string; parentId?: number }>;
    groupMedia?: Array<{ groupIndex: number; count: number }>;
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
      source,
      user_preferences,
      "user"
    RESTART IDENTITY CASCADE
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

  // Seed a default user so that preferences API works in tests
  await db.insert(dbSchema.user).values({
    updatedAt: new Date(),
    username: "test-user",
  });

  // Seed the test plugin queue
  globalThis.__testPluginQueue = body.media ?? [];
  globalThis.__testPluginDelayMs = body.delay ?? 0;
  globalThis.__testPageSize = body.pageSize;

  // Seed groups if provided, tracking returned IDs
  const groupIds: number[] = [];
  if (body.groups?.length) {
    for (const g of body.groups) {
      const [inserted] = await db
        .insert(dbSchema.group)
        .values({
          name: g.name,
          parentId: g.parentId ?? null,
          updatedAt: new Date(),
        })
        .returning({ id: dbSchema.group.id });
      if (inserted) groupIds.push(inserted.id);
    }
  }

  // Directly seed cache_media records associated with groups
  if (body.groupMedia?.length && groupIds.length) {
    const now = new Date();
    for (const { groupIndex, count } of body.groupMedia) {
      const groupId = groupIds[groupIndex];
      if (groupId === undefined) continue;
      for (let i = 0; i < count; i++) {
        const mediaId = `seeded-group${groupId}-item${i}`;
        await db.insert(dbSchema.cacheMedia).values({
          updatedAt: now,
          groupIds: [groupId],
          hasImage: true,
          liaseIds: [`test-source\t${mediaId}`],
          liaseSourceIds: ["test-source"],
          files: [
            {
              createdAt: now,
              updatedAt: now,
              urlUpdatedAt: now,
              liaseSourceId: "test-source",
              liaseMediaId: mediaId,
              type: "main",
              url: `https://picsum.photos/seed/${mediaId}/800/600`,
              ext: "jpg",
              mimeType: "image/jpeg",
              hasVideo: null,
              hasAudio: null,
              hasImage: true,
              duration: null,
              fileSize: null,
              width: 800,
              height: 600,
              urlExpires: null,
              urlRefreshDetails: null,
            },
          ],
          sources: [],
        });
      }
    }
  }

  return { ok: true, groupIds };
});
