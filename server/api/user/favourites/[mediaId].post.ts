import { and, eq } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam } from "h3";
import { db, dbSchema } from "../../../utils/drizzle";

export default defineEventHandler(async (event) => {
  const mediaIdParam = getRouterParam(event, "mediaId");
  const mediaId =
    mediaIdParam !== undefined ? Number(mediaIdParam) : Number.NaN;
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw createError({ statusCode: 400, statusMessage: "Invalid media ID" });
  }

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const existing = await db
    .select({ favourited: dbSchema.userCacheMediaInfo.favourited })
    .from(dbSchema.userCacheMediaInfo)
    .where(
      and(
        eq(dbSchema.userCacheMediaInfo.userId, user.id),
        eq(dbSchema.userCacheMediaInfo.cacheMediaId, mediaId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const newFavourited = !(existing?.favourited ?? false);

  if (existing) {
    await db
      .update(dbSchema.userCacheMediaInfo)
      .set({ favourited: newFavourited })
      .where(
        and(
          eq(dbSchema.userCacheMediaInfo.userId, user.id),
          eq(dbSchema.userCacheMediaInfo.cacheMediaId, mediaId),
        ),
      );
  } else {
    await db.insert(dbSchema.userCacheMediaInfo).values({
      userId: user.id,
      cacheMediaId: mediaId,
      favourited: newFavourited,
    });
  }

  return { favourited: newFavourited };
});
