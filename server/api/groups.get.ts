import { db, dbSchema } from "@@/server/utils/drizzle";
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  sql,
} from "drizzle-orm";
import { defineEventHandler, getValidatedQuery } from "h3";
import { z } from "zod";

type GroupWithCounts = {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  parentId: number | null;
  name: string;
  subgroupCount: number;
  mediaCount: number;
};

type ParentIdParam = number | "null" | undefined;

function parentConditionSql(parentIdParam: ParentIdParam) {
  return parentIdParam === "null" || parentIdParam === undefined
    ? sql`parent_id IS NULL`
    : sql`parent_id = ${parentIdParam}`;
}

function parentConditionSqlQualified(parentIdParam: ParentIdParam) {
  return parentIdParam === "null" || parentIdParam === undefined
    ? sql`"group".parent_id IS NULL`
    : sql`"group".parent_id = ${parentIdParam}`;
}

/**
 * Fetch groups sorted by media or total count.
 *
 * Uses two CTEs so that cache_media is scanned once for all groups rather than
 * once per group via a correlated subquery (which would be O(N) GIN probes).
 */
async function fetchGroupsViaCTE({
  parentIdParam,
  search,
  sort,
  dir,
  page,
  pageSize,
}: {
  parentIdParam: ParentIdParam;
  search: string | undefined;
  sort: "total" | "media";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}): Promise<GroupWithCounts[]> {
  type RawRow = {
    id: number;
    created_at: Date;
    updated_at: Date;
    parent_id: number | null;
    name: string;
    subgroup_count: string;
    media_count: string;
  };

  const parentInner = parentConditionSql(parentIdParam);
  const parentOuter = parentConditionSqlQualified(parentIdParam);
  const searchSql = search
    ? sql` AND "group".name ILIKE ${`%${search}%`}`
    : sql``;
  const dirKeyword = sql.raw(dir === "asc" ? "ASC" : "DESC");
  const orderBySql =
    sort === "total"
      ? sql`COALESCE(mc.cnt, 0) + COALESCE(sg.cnt, 0) ${dirKeyword}, "group".name ASC`
      : sql`COALESCE(mc.cnt, 0) ${dirKeyword}, "group".name ASC`;

  const rows = Array.from(
    await db.execute<RawRow>(sql`
      WITH mc_counts AS (
        SELECT elem::int AS group_id, COUNT(*) AS cnt
        FROM cache_media
        CROSS JOIN LATERAL unnest(group_ids) AS elem
        WHERE elem IN (SELECT id FROM "group" WHERE ${parentInner})
        GROUP BY 1
      ),
      sg_counts AS (
        SELECT parent_id AS group_id, COUNT(*) AS cnt
        FROM "group"
        WHERE parent_id IN (SELECT id FROM "group" WHERE ${parentInner})
        GROUP BY parent_id
      )
      SELECT
        "group".id,
        "group".created_at,
        "group".updated_at,
        "group".parent_id,
        "group".name,
        COALESCE(sg.cnt, 0) AS subgroup_count,
        COALESCE(mc.cnt, 0) AS media_count
      FROM "group"
      LEFT JOIN mc_counts mc ON mc.group_id = "group".id
      LEFT JOIN sg_counts sg ON sg.group_id = "group".id
      WHERE ${parentOuter}${searchSql}
      ORDER BY ${orderBySql}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
  );

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parentId: r.parent_id,
    name: r.name,
    subgroupCount: Number(r.subgroup_count),
    mediaCount: Number(r.media_count),
  }));
}

/**
 * Fetch groups sorted by name, subgroup count, or randomly.
 *
 * These sorts don't need media counts during ORDER BY, so correlated subqueries
 * are only evaluated for the page-sized result set (fast).
 */
async function fetchGroupsViaCorrelatedSubqueries({
  whereClause,
  sort,
  dir,
  seed,
  page,
  pageSize,
}: {
  whereClause: SQL | undefined;
  sort: "name" | "subgroups" | "random";
  dir: "asc" | "desc";
  seed: number;
  page: number;
  pageSize: number;
}): Promise<GroupWithCounts[]> {
  const subgroupCountExpr = sql<number>`(SELECT COUNT(*) FROM "group" AS child_g WHERE child_g.parent_id = "group".id)`;
  const mediaCountExpr = sql<number>`(SELECT COUNT(*) FROM cache_media WHERE group_ids @> ARRAY["group".id])`;
  const order = dir === "asc" ? asc : desc;

  const orderBy =
    sort === "random"
      ? [sql`hashint4("group".id + ${seed})`]
      : sort === "name"
        ? [order(dbSchema.group.name)]
        : [
            order(
              sql<number>`(SELECT COUNT(*) FROM "group" AS child_g WHERE child_g.parent_id = "group".id)`,
            ),
            asc(dbSchema.group.name),
          ];

  const rows = await db
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
    .offset((page - 1) * pageSize);

  return rows.map((r) => ({
    ...r,
    subgroupCount: Number(r.subgroupCount),
    mediaCount: Number(r.mediaCount),
  }));
}

/**
 * For each group, fetch up to 4 preview media in a single batched query.
 * Returns a map from group ID to an array of poster image URLs.
 */
async function fetchPreviewImages(
  groupIds: number[],
): Promise<Map<number, string[]>> {
  if (groupIds.length === 0) return new Map();

  type PreviewRow = {
    g_id: number;
    id: number;
    files: Array<{
      type: string;
      hasImage?: boolean;
      hasVideo?: boolean;
    }> | null;
  };

  const valuesList = sql.join(
    groupIds.map((id) => sql`(${id}::int)`),
    sql`, `,
  );

  // Inner subquery fetches up to 1000 candidates via the GIN index (no ORDER BY
  // so PostgreSQL stops early).  The outer lateral then sorts those 1000 rows by
  // a stable per-(media, group) hash and takes 4, giving each group a different
  // deterministic selection without a full table scan.
  const rows = Array.from(
    await db.execute<PreviewRow>(sql`
      SELECT g.g_id, cm.id, cm.files
      FROM (VALUES ${valuesList}) AS g(g_id)
      CROSS JOIN LATERAL (
        SELECT id, files
        FROM (
          SELECT id, files
          FROM cache_media
          WHERE group_ids @> ARRAY[g.g_id::int]
          LIMIT 1000
        ) candidates
        ORDER BY hashint4(id + g.g_id)
        LIMIT 4
      ) cm
    `),
  );

  const previewMap = new Map<number, string[]>();
  for (const row of rows) {
    const file = row.files?.find((f) => f.hasImage || f.hasVideo);
    if (!file) continue;
    const gId = Number(row.g_id);
    const existing = previewMap.get(gId) ?? [];
    existing.push(`/file/poster/${row.id}/${file.type}/300`);
    previewMap.set(gId, existing);
  }
  return previewMap;
}

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
  const parentIdParam = query.parentId;

  const seed = query.seed ?? 0;

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

  const groups =
    sort === "total" || sort === "media"
      ? await fetchGroupsViaCTE({
          parentIdParam,
          search,
          sort,
          dir,
          page,
          pageSize,
        })
      : await fetchGroupsViaCorrelatedSubqueries({
          whereClause,
          sort,
          dir,
          seed,
          page,
          pageSize,
        });

  const [countResult, previewMap] = await Promise.all([
    db.select({ totalCount: count() }).from(dbSchema.group).where(whereClause),
    fetchPreviewImages(groups.map((g) => g.id)),
  ]);

  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      subgroupCount: g.subgroupCount,
      mediaCount: g.mediaCount,
      previewImages: previewMap.get(g.id) ?? [],
    })),
    totalCount: countResult[0]?.totalCount ?? 0,
    page,
    pageSize,
  };
});
