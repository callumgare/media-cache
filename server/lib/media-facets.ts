import type {
  FacetCount,
  SourceFacetCount,
  TagFacetCount,
  TypeFacetCount,
} from "@@/types/api-media-facets";
import type {
  QueryCondition,
  QueryFieldCondition,
  QueryGroupCondition,
} from "@@/types/query-condition";
import { type SQL, count, inArray, sql, sum } from "drizzle-orm";
import { db, dbSchema } from "../utils/drizzle";
import { calculateWhereValue } from "../utils/query-builder";

export function blankConditionById(
  condition: QueryCondition,
  id: number,
): QueryCondition {
  if (condition.type === "field") {
    return condition.id === id ? { ...condition, value: "" } : condition;
  }
  return {
    ...condition,
    conditions: condition.conditions.map((c) => blankConditionById(c, id)),
  };
}

export function replaceConditionValue(
  condition: QueryCondition,
  id: number,
  newValue: unknown,
): QueryCondition {
  if (condition.type === "field") {
    return condition.id === id ? { ...condition, value: newValue } : condition;
  }
  return {
    ...condition,
    conditions: condition.conditions.map((c) =>
      replaceConditionValue(c, id, newValue),
    ),
  };
}

export async function countWhere(where: SQL | null): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(dbSchema.cacheMedia)
    .where(where ?? undefined);
  return result[0]?.count ?? 0;
}

export function fetchFieldCounts(
  condition: QueryFieldCondition & { field: "source" },
  body: QueryGroupCondition,
): Promise<SourceFacetCount[]>;
export function fetchFieldCounts(
  condition: QueryFieldCondition & { field: "tags" },
  body: QueryGroupCondition,
): Promise<TagFacetCount[]>;
export function fetchFieldCounts(
  condition: QueryFieldCondition & { field: "type" },
  body: QueryGroupCondition,
): Promise<TypeFacetCount[]>;
export function fetchFieldCounts(
  condition: QueryFieldCondition,
  body: QueryGroupCondition,
): Promise<FacetCount[]>;
export async function fetchFieldCounts(
  condition: QueryFieldCondition,
  body: QueryGroupCondition,
): Promise<FacetCount[]> {
  const baseCondition =
    condition.operator === "includes all"
      ? body
      : blankConditionById(body, condition.id);
  const where = calculateWhereValue(baseCondition);

  if (condition.field === "source") {
    const [row] = await db.execute<{
      agg: { buckets: Array<{ key: string; doc_count: number }> };
    }>(sql`
      SELECT pdb.agg('{"terms": {"field": "finder_source_ids", "size": 500}}') AS agg
      FROM cache_media
      WHERE ${where}
    `);
    return (row?.agg?.buckets ?? []).map(
      (b): SourceFacetCount => ({ finderSourceId: b.key, count: b.doc_count }),
    );
  }

  if (condition.field === "tags") {
    const [tagRow] = await db.execute<{
      agg: {
        buckets: Array<{ key: string; doc_count: number }>;
        sum_other_doc_count: number;
      };
    }>(sql`
      SELECT pdb.agg('{"terms": {"field": "group_ids", "size": 5000}}') AS agg
      FROM cache_media
      WHERE ${where}
    `);
    const allBuckets = tagRow?.agg?.buckets ?? [];
    // ParadeDB emits a "__PDB_NULL__" sentinel (with invisible Unicode prefix chars) for rows
    // with empty arrays. Filter to only numeric keys since group IDs are always integers.
    const buckets = allBuckets.filter((b) => !Number.isNaN(Number(b.key)));

    if (!buckets.length) return [];

    const groupIds = buckets.map((b) => Number(b.key));
    const groups = await db
      .select({ id: dbSchema.group.id, name: dbSchema.group.name })
      .from(dbSchema.group)
      .where(inArray(dbSchema.group.id, groupIds));
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    const currentValues = new Set(
      Array.isArray(condition.value) ? condition.value.map(Number) : [],
    );
    const addedIfRemovedByTagId = new Map<number, number>();
    if (currentValues.size > 0) {
      const currentTotal = await countWhere(where);
      const results = await Promise.allSettled(
        [...currentValues].map(async (selectedId) => {
          const newValues = [...currentValues].filter((v) => v !== selectedId);
          const modifiedWhere = calculateWhereValue(
            replaceConditionValue(body, condition.id, newValues),
          );
          const countWithout = await countWhere(modifiedWhere);
          return { selectedId, count: countWithout - currentTotal };
        }),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          addedIfRemovedByTagId.set(
            result.value.selectedId,
            result.value.count,
          );
        } else {
          console.error(
            "Failed to compute addedIfRemoved for tag:",
            result.reason,
          );
        }
      }
    }

    return buckets
      .map((b): TagFacetCount | null => {
        const id = Number(b.key);
        const name = groupNameById.get(id);
        if (name === undefined) return null;
        return {
          id,
          name,
          count: b.doc_count,
          addedIfRemoved: addedIfRemovedByTagId.get(id) ?? null,
        };
      })
      .filter((r): r is TagFacetCount => r !== null);
  }

  if (condition.field === "type") {
    const { hasVideo, hasImage, hasAudio } = dbSchema.cacheMedia;
    const [row] = await db
      .select({
        video: sum(
          sql`CASE WHEN ${hasVideo} AND NOT ${hasImage} THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        videoWithAudio: sum(
          sql`CASE WHEN ${hasVideo} AND NOT ${hasImage} AND ${hasAudio} THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        videoWithoutAudio: sum(
          sql`CASE WHEN ${hasVideo} AND NOT ${hasImage} AND NOT ${hasAudio} THEN 1 ELSE 0 END`,
        ).mapWith(Number),
        image: sum(
          sql`CASE WHEN ${hasImage} AND NOT ${hasVideo} THEN 1 ELSE 0 END`,
        ).mapWith(Number),
      })
      .from(dbSchema.cacheMedia)
      .where(where);
    return [
      { value: "video", count: row?.video ?? 0 },
      { value: "video-with-audio", count: row?.videoWithAudio ?? 0 },
      { value: "video-without-audio", count: row?.videoWithoutAudio ?? 0 },
      { value: "image", count: row?.image ?? 0 },
    ] satisfies TypeFacetCount[];
  }

  return [];
}
