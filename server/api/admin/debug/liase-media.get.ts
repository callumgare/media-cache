import { mergeLiaseMedia } from "@@/server/lib/liase/utils";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(
    event,
    z.object({ cacheMediaId: z.coerce.number().int().positive() }).parse,
  );

  const [cacheMedia] = await db
    .select({ liaseIds: dbSchema.cacheMedia.liaseIds })
    .from(dbSchema.cacheMedia)
    .where(eq(dbSchema.cacheMedia.id, query.cacheMediaId))
    .limit(1);

  if (!cacheMedia) {
    throw createError({ statusCode: 404, message: "Cache media not found" });
  }

  if (cacheMedia.liaseIds.length === 0) return [];

  const records = await db
    .select({
      liaseId: dbSchema.liaseQueryMedia.liaseId,
      content: dbSchema.liaseQueryMediaContent.content,
      updatedAt: dbSchema.liaseQueryMedia.updatedAt,
    })
    .from(dbSchema.liaseQueryMedia)
    .innerJoin(
      dbSchema.liaseQueryMediaContent,
      eq(
        dbSchema.liaseQueryMedia.contentHash,
        dbSchema.liaseQueryMediaContent.contentHash,
      ),
    )
    .where(inArray(dbSchema.liaseQueryMedia.liaseId, cacheMedia.liaseIds))
    .orderBy(asc(dbSchema.liaseQueryMedia.updatedAt));

  const byLiaseId = new Map<string, typeof records>();
  for (const record of records) {
    let group = byLiaseId.get(record.liaseId);
    if (!group) {
      group = [];
      byLiaseId.set(record.liaseId, group);
    }
    group.push(record);
  }

  return cacheMedia.liaseIds.map((liaseId) => {
    const group = byLiaseId.get(liaseId) ?? [];
    const liaseMedias = group.map((r) => r.content);
    if (liaseMedias.length === 0) return { liaseId, mergedMedia: null };
    return { liaseId, mergedMedia: mergeLiaseMedia({ liaseMedias }) };
  });
});
