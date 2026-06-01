import { queryConditionGroupSchema } from "@@/types/query-condition";
import { sortConfigSchema } from "@@/types/sort-config";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { defineEventHandler, getValidatedQuery, readValidatedBody } from "h3";
import { serialize } from "superjson";
import { z } from "zod";
import type { APIMedia } from "../../types/api-media";
import { tagsGroupName } from "../lib/groups";
import { db, dbSchema } from "../utils/drizzle";
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

  const seed = sort.field === "random" ? (body.seed ?? 0) : 0;

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  // Use standard SQL (GIN/BTree operators) instead of the BM25 `===` operator.
  // The covering BTree index (id) INCLUDE (liase_source_ids, group_ids, has_video,
  // has_audio, has_image) allows index-only scans with 0 heap fetches, which is
  // ~6x faster than a BM25 scan that must visit the heap for every matching row.
  const whereClause = calculateWhereValue(condition, {
    optimisationHint: "select",
    userId: user?.id ?? null,
  });

  // Build ORDER BY for the pagination query.
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

  // Run the data fetch and total count in parallel.
  // Separating the COUNT from the data query allows PostgreSQL to:
  //   1. Use parallel workers for both queries concurrently
  //   2. Use a streaming top-N heapsort for the data query (holds only 10 rows in
  //      memory at a time) rather than materializing all 655k rows for a WindowAgg
  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(dbSchema.cacheMedia)
      .where(whereClause)
      .orderBy(buildOrderBy())
      .limit(returnedNumber)
      .offset((pageNumber - 1) * returnedNumber),
    db.select({ count: count() }).from(dbSchema.cacheMedia).where(whereClause),
  ]);

  const totalCount = Number(countResult[0]?.count ?? 0);
  const dbMedias = rows;

  // Collect all group IDs referenced by this page of media.
  const allGroupIds = [...new Set(dbMedias.flatMap((m) => m.groupIds ?? []))];

  // Fetch group names and tag status in one query instead of three.
  // A group is a "tag" when its direct parent is the root "Tags" group.
  // Use a LEFT JOIN with an alias to avoid self-referencing table name ambiguity.
  const parentGroup = alias(dbSchema.group, "parent_group");
  const groupRows = allGroupIds.length
    ? await db
        .select({
          id: dbSchema.group.id,
          name: dbSchema.group.name,
          parentGroupId: parentGroup.id,
        })
        .from(dbSchema.group)
        .leftJoin(
          parentGroup,
          and(
            eq(parentGroup.id, dbSchema.group.parentId),
            eq(parentGroup.name, tagsGroupName),
            isNull(parentGroup.parentId),
          ),
        )
        .where(inArray(dbSchema.group.id, allGroupIds))
    : [];

  const groupNameById = new Map(groupRows.map((r) => [r.id, r.name]));
  const tagGroupIds = new Set(
    groupRows.filter((r) => r.parentGroupId !== null).map((r) => r.id),
  );

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

  return {
    toJSON: () =>
      serialize({
        totalCount,
        pageSize: returnedNumber,
        media: apiMedias,
        page: pageNumber,
        date: new Date(),
      }),
  };
});
