import type { QueryGroupCondition } from "@@/types/query-condition";
import { queryConditionGroupSchema } from "@@/types/query-condition";
import { sortConfigSchema } from "@@/types/sort-config";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { APIMedia } from "../../types/api-media";
import { tagsGroupName } from "../lib/groups";
import { calculateWhereValue } from "../utils/query-builder";

declare global {
  var __testPageSize: number | undefined;
}

const defaultPageSize = 10;

const mediaRequestBodySchema = z.object({
  condition: queryConditionGroupSchema,
  sort: sortConfigSchema,
  seed: z.number().int().optional(),
});

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

export default defineEventHandler(async (event) => {
  const returnedNumber =
    (process.env.ENABLE_TEST_API && globalThis.__testPageSize) ||
    defaultPageSize;
  const query = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().int(),
    }).parse,
  );
  const body = await readValidatedBody(event, mediaRequestBodySchema.parse);

  const pageNumber = query.page;
  const { condition, sort } = body;

  const seed =
    sort.field === "random" && body.seed !== undefined
      ? Math.floor(
          Math.sin(
            body.seed * 10000 +
              new Date().getMonth() * 100 +
              new Date().getDate(),
          ) * 10000000,
        )
      : 0;

  const whereClause = calculateWhereValue(condition);

  const totalCount = await db
    .select({ count: count() })
    .from(dbSchema.cacheMedia)
    .where(whereClause)
    .then((res) => res[0]?.count ?? 0);

  // Build ORDER BY for both pagination and final fetch queries
  const buildOrderBy = () => {
    if (sort.field === "random") {
      return sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`;
    }
    const dir = sort.direction === "desc" ? desc : asc;
    if (sort.field === "createdOrUploadedAt")
      return dir(
        sql`COALESCE(${dbSchema.cacheMedia.earliestCreatedAt}, ${dbSchema.cacheMedia.earliestUploadedAt})`,
      );
    if (sort.field === "firstIndexedAt")
      return dir(dbSchema.cacheMedia.firstIndexedAt);
    if (sort.field === "updatedAt") return dir(dbSchema.cacheMedia.updatedAt);
    if (sort.field === "duration")
      return dir(sql`COALESCE(${dbSchema.cacheMedia.duration}, -1)`);
    return dir(dbSchema.cacheMedia.title);
  };

  const resultIds = await db
    .select({ mediaId: dbSchema.cacheMedia.id })
    .from(dbSchema.cacheMedia)
    .where(whereClause)
    .offset((pageNumber - 1) * returnedNumber)
    .orderBy(buildOrderBy())
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
      .orderBy(buildOrderBy());
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
    where: (g, { isNull, eq }) =>
      and(eq(g.name, tagsGroupName), isNull(g.parentId)),
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
        ...media,
        tags: (media.groupIds ?? [])
          .map(Number)
          .filter((id) => tagGroupIds.has(id))
          .map((id) => groupNameById.get(id))
          .filter((name): name is string => name !== undefined),
        sourceDetails: (media.sources ?? []).map((src) => ({
          ...src,
          sourceName: src.liaseSourceId,
          uploadedAt: toDateOrNull(src.uploadedAt),
        })),
        files: (media.files ?? []).map((file) => {
          return {
            ...file,
            filename: `media-${media.id}-${file.type}.${file.ext}`,
            sourceUrl: file.url,
            urlExpires: toDateOrNull(file.urlExpires),
            urlUpdatedAt: toDate(file.urlUpdatedAt),
          };
        }),
      }) satisfies z.infer<typeof APIMedia>,
  );

  return toSuperJSON({
    totalCount,
    pageSize: returnedNumber,
    media: apiMedias,
    page: pageNumber,
    date: new Date(),
  });
});
