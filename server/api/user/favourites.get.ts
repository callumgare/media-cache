import { and, eq } from "drizzle-orm";
import { defineEventHandler } from "h3";
import { db, dbSchema } from "../../utils/drizzle";

export default defineEventHandler(async () => {
  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    return [] as number[];
  }

  const rows = await db
    .select({ cacheMediaId: dbSchema.userCacheMediaInfo.cacheMediaId })
    .from(dbSchema.userCacheMediaInfo)
    .where(
      and(
        eq(dbSchema.userCacheMediaInfo.userId, user.id),
        eq(dbSchema.userCacheMediaInfo.favourited, true),
      ),
    );

  return rows.map((r) => r.cacheMediaId) as number[];
});
