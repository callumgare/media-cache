import type { QueryGroupCondition } from "@@/types/query-condition";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { APIMedia, APIMediaResponse } from "../../types/api-media";
import { calculateWhereValue } from "../utils/query-builder";

const returnedNumber = 10;

export default defineEventHandler(
  async (event): Promise<z.infer<typeof APIMediaResponse>> => {
    const query = await getValidatedQuery(
      event,
      z.object({
        page: z.coerce.number().int(),
        seed: z.coerce.number().int(),
      }).parse,
    );
    const body: QueryGroupCondition = await readBody(event);

    const pageNumber = query.page;

    const seed = Math.floor(
      Math.sin(
        query.seed * 10000 + new Date().getMonth() * 100 + new Date().getDate(),
      ) * 10000000,
    );

    const whereClause = calculateWhereValue(body);

    const totalCount = await db
      .select({ count: count() })
      .from(dbSchema.cacheMedia)
      .where(whereClause)
      .then((res) => res[0]?.count ?? 0);

    const resultIds = await db
      .select({
        mediaId: dbSchema.cacheMedia.id,
        hash: sql<number>`hashint4(${dbSchema.cacheMedia.id} + ${seed})`.as(
          "hash",
        ),
      })
      .from(dbSchema.cacheMedia)
      .where(whereClause)
      .offset((pageNumber - 1) * returnedNumber)
      .orderBy(sql`"hash"`)
      .limit(returnedNumber);

    let dbMedias: (typeof dbSchema.cacheMedia.$inferSelect)[] = [];
    if (resultIds.length) {
      dbMedias = await db
        .select()
        .from(dbSchema.cacheMedia)
        .where(
          inArray(
            dbSchema.cacheMedia.id,
            resultIds.map((res) => res.mediaId),
          ),
        )
        .orderBy(sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`);
    }

    const allGroupIds = [
      ...new Set(dbMedias.flatMap((m) => (m.groupIds ?? []).map(Number))),
    ];
    const groupNameById = allGroupIds.length
      ? await db
          .select({ id: dbSchema.group.id, name: dbSchema.group.name })
          .from(dbSchema.group)
          .where(inArray(dbSchema.group.id, allGroupIds))
          .then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      : new Map<number, string>();

    const rootTagsGroup = await db.query.group.findFirst({
      where: (g, { isNull, eq }) => and(eq(g.name, "tags"), isNull(g.parentId)),
      columns: { id: true },
    });
    const tagGroupIds = rootTagsGroup
      ? new Set(
          await db
            .select({ id: dbSchema.group.id })
            .from(dbSchema.group)
            .where(eq(dbSchema.group.parentId, rootTagsGroup.id))
            .then((rows) => rows.map((r) => r.id)),
        )
      : new Set<number>();

    const apiMedias = dbMedias.map(
      (media) =>
        ({
          id: media.id,
          title: media.title,
          description: media.description,
          tags: (media.groupIds ?? [])
            .map(Number)
            .filter((id) => tagGroupIds.has(id))
            .map((id) => groupNameById.get(id))
            .filter((name): name is string => name !== undefined),
          sourceDetails: (media.sources ?? []).map((src) => ({
            sourceName: src.finderSourceId,
            title: src.title ?? null,
            url: src.url ?? null,
            creator: src.creator ?? null,
            views: src.views ?? null,
            likes: src.likes ?? null,
            likesPercentage: src.likesPercentage ?? null,
          })),
          files: (media.files ?? []).map((file) => {
            return {
              type: file.type,
              hasVideo: file.hasVideo ?? null,
              hasAudio: file.hasAudio ?? null,
              hasImage: file.hasImage ?? null,
              fileSize: file.fileSize ?? null,
              width: file.width ?? null,
              height: file.height ?? null,
              ext: file.ext ?? null,
              filename: `media-${media.id}-${file.type}.${file.ext}`,
              sourceUrl: file.url,
            };
          }),
        }) satisfies z.infer<typeof APIMedia>,
    );

    return {
      totalCount,
      pageSize: returnedNumber,
      media: apiMedias,
      page: pageNumber,
      date: new Date(),
    };
  },
);
