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
  condition: QueryFieldCondition & { field: "tags" | "groups" },
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
      SELECT pdb.agg('{"terms": {"field": "liase_source_ids", "size": 500}}') AS agg
      FROM cache_media
      WHERE ${where}
    `);
    return (row?.agg?.buckets ?? []).map(
      (b): SourceFacetCount => ({
        liaseSourceId: b.key,
        name: null,
        count: b.doc_count,
      }),
    );
  }

  if (condition.field === "tags" || condition.field === "groups") {
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

    const currentValues = new Set(
      Array.isArray(condition.value) ? condition.value.map(Number) : [],
    );
    const bucketIds = buckets.map((b) => Number(b.key));
    const allRelevantIds = [...new Set([...bucketIds, ...currentValues])];

    if (!allRelevantIds.length) return [];

    const groups = await db
      .select({ id: dbSchema.group.id, name: dbSchema.group.name })
      .from(dbSchema.group)
      .where(inArray(dbSchema.group.id, allRelevantIds));
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    const countAddedIfRemovedByTagId = new Map<number, number>();
    if (currentValues.size > 0) {
      const currentTotal = await countWhere(where);
      const selectedIds = [...currentValues];
      // Single UNION ALL query instead of one query per selected tag
      const unionQuery = sql.join(
        selectedIds.map((selectedId) => {
          const newValues = selectedIds.filter((v) => v !== selectedId);
          const modifiedWhere = calculateWhereValue(
            replaceConditionValue(body, condition.id, newValues),
          );
          return sql`SELECT ${selectedId}::int AS tag_id, count(*)::int AS tag_count FROM cache_media WHERE ${modifiedWhere ?? sql`TRUE`}`;
        }),
        sql` UNION ALL `,
      );
      const rows = await db.execute<{ tag_id: number; tag_count: number }>(
        unionQuery,
      );
      for (const row of rows) {
        countAddedIfRemovedByTagId.set(
          row.tag_id,
          row.tag_count - currentTotal,
        );
      }
    }

    const result: TagFacetCount[] = buckets
      .map((b): TagFacetCount | null => {
        const id = Number(b.key);
        const name = groupNameById.get(id);
        if (name === undefined) return null;
        return {
          id,
          name,
          count: b.doc_count,
          countAddedIfRemoved: countAddedIfRemovedByTagId.get(id) ?? null,
        };
      })
      .filter((r): r is TagFacetCount => r !== null);

    // Include selected tags not in buckets (count=0) so they still appear in the sidebar
    const resultIds = new Set(result.map((r) => r.id));
    for (const selectedId of currentValues) {
      if (!resultIds.has(selectedId)) {
        const name = groupNameById.get(selectedId);
        if (name !== undefined) {
          result.push({
            id: selectedId,
            name,
            count: 0,
            countAddedIfRemoved:
              countAddedIfRemovedByTagId.get(selectedId) ?? null,
          });
        }
      }
    }

    return result;
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
