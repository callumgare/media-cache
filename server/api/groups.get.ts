import { db, dbSchema } from "@@/server/utils/drizzle";
import { and, asc, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { defineEventHandler, getValidatedQuery } from "h3";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(
    event,
    z.object({
      parentId: z
        .union([z.coerce.number().int(), z.literal("null")])
        .optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(globalThis.__testPageSize ?? 20),
      sort: z
        .enum(["name", "subgroups", "media", "total", "random"])
        .default("total"),
      dir: z.enum(["asc", "desc"]).default("desc"),
      seed: z.coerce.number().int().optional(),
    }).parse,
  );

  const { search, page, pageSize, sort, dir } = query;

  const seed =
    query.seed !== undefined
      ? Math.floor(
          Math.sin(
            query.seed * 10000 +
              new Date().getMonth() * 100 +
              new Date().getDate(),
          ) * 10000000,
        )
      : 0;
  const parentIdParam = query.parentId;

  const parentCondition =
    parentIdParam === "null" || parentIdParam === undefined
      ? isNull(dbSchema.group.parentId)
      : eq(dbSchema.group.parentId, parentIdParam);

  const searchCondition = search
    ? ilike(dbSchema.group.name, `%${search}%`)
    : undefined;
  const whereClause = searchCondition
    ? and(parentCondition, searchCondition)
    : parentCondition;

  const subgroupCountExpr = sql<number>`(SELECT COUNT(*) FROM "group" AS child_g WHERE child_g.parent_id = "group".id)`;
  const mediaCountExpr = sql<number>`(SELECT COUNT(*) FROM cache_media WHERE group_ids @> ARRAY["group".id::text])`;

  const order = dir === "asc" ? asc : desc;

  const orderBy =
    sort === "random"
      ? [sql`hashint4("group".id + ${seed})`]
      : sort === "name"
        ? [order(dbSchema.group.name)]
        : sort === "subgroups"
          ? [
              order(
                sql<number>`(SELECT COUNT(*) FROM "group" AS child_g WHERE child_g.parent_id = "group".id)`,
              ),
              asc(dbSchema.group.name),
            ]
          : sort === "media"
            ? [
                order(
                  sql<number>`(SELECT COUNT(*) FROM cache_media WHERE group_ids @> ARRAY["group".id::text])`,
                ),
                asc(dbSchema.group.name),
              ]
            : [
                order(
                  sql<number>`(SELECT COUNT(*) FROM "group" AS child_g WHERE child_g.parent_id = "group".id) + (SELECT COUNT(*) FROM cache_media WHERE group_ids @> ARRAY["group".id::text])`,
                ),
                asc(dbSchema.group.name),
              ];

  const [countResult, groups] = await Promise.all([
    db.select({ totalCount: count() }).from(dbSchema.group).where(whereClause),
    db
      .select({
        id: dbSchema.group.id,
        createdAt: dbSchema.group.createdAt,
        updatedAt: dbSchema.group.updatedAt,
        parentId: dbSchema.group.parentId,
        name: dbSchema.group.name,
        subgroupCount: subgroupCountExpr,
        mediaCount: mediaCountExpr,
      })
      .from(dbSchema.group)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  // For each group, fetch up to 4 preview media
  const groupsWithPreviews = await Promise.all(
    groups.map(async (g) => {
      const previewMedia = await db
        .select({
          id: dbSchema.cacheMedia.id,
          files: dbSchema.cacheMedia.files,
        })
        .from(dbSchema.cacheMedia)
        .where(
          sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${String(g.id)}]::text[]`,
        )
        .orderBy(sql`hashint4(${dbSchema.cacheMedia.id} + ${g.id})`)
        .limit(4);

      const previewImages = previewMedia.flatMap((m) => {
        const file = (
          m.files as Array<{
            type: string;
            filename?: string;
            hasImage?: boolean;
            hasVideo?: boolean;
          }> | null
        )?.find((f) => f.hasImage || f.hasVideo);
        if (!file) return [];
        return [`/file/poster/${m.id}/${file.type}/300`];
      });

      return {
        id: g.id,
        name: g.name,
        parentId: g.parentId,
        subgroupCount: Number(g.subgroupCount),
        mediaCount: Number(g.mediaCount),
        previewImages,
      };
    }),
  );

  return {
    groups: groupsWithPreviews,
    totalCount: countResult[0]?.totalCount ?? 0,
    page,
    pageSize,
  };
});
