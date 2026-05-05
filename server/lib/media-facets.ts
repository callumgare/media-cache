import { sql, type SQL } from 'drizzle-orm'
import { calculateWhereValue } from '../utils/query-builder'
import { db, dbSchema } from '../utils/drizzle'
import type { FacetCount, SourceFacetCount, TagFacetCount, TypeFacetCount } from '@@/types/api-media-facets'
import type { QueryCondition, QueryFieldCondition, QueryGroupCondition } from '@@/types/query-condition'

export function blankConditionById(condition: QueryCondition, id: number): QueryCondition {
  if (condition.type === 'field') {
    return condition.id === id ? { ...condition, value: '' } : condition
  }
  return { ...condition, conditions: condition.conditions.map(c => blankConditionById(c, id)) }
}

export function replaceConditionValue(condition: QueryCondition, id: number, newValue: unknown): QueryCondition {
  if (condition.type === 'field') {
    return condition.id === id ? { ...condition, value: newValue } : condition
  }
  return { ...condition, conditions: condition.conditions.map(c => replaceConditionValue(c, id, newValue)) }
}

export async function countWhere(where: SQL | null): Promise<number> {
  const whereSql = where ? sql`WHERE ${where}` : sql``
  const [row] = await db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM cache_media ${whereSql}`)
  return row?.count ?? 0
}

export function fetchFieldCounts(condition: QueryFieldCondition & { field: 'source' }, body: QueryGroupCondition): Promise<SourceFacetCount[]>
export function fetchFieldCounts(condition: QueryFieldCondition & { field: 'tags' }, body: QueryGroupCondition): Promise<TagFacetCount[]>
export function fetchFieldCounts(condition: QueryFieldCondition & { field: 'type' }, body: QueryGroupCondition): Promise<TypeFacetCount[]>
export function fetchFieldCounts(condition: QueryFieldCondition, body: QueryGroupCondition): Promise<FacetCount[]>
export async function fetchFieldCounts(condition: QueryFieldCondition, body: QueryGroupCondition): Promise<FacetCount[]> {
  const baseWhere = condition.operator === 'includes all'
    ? calculateWhereValue(body)
    : calculateWhereValue(blankConditionById(body, condition.id))
  const whereSql: SQL = baseWhere ? sql`WHERE ${baseWhere}` : sql``

  if (condition.field === 'source') {
    const col = dbSchema.cacheMedia.finderSourceMediaIds
    const rows = await db.execute<{ finder_source_id: string, count: number }>(sql`
      SELECT s.finder_source_id, COUNT(DISTINCT cache_media.id)::int AS count
      FROM cache_media
      CROSS JOIN LATERAL (
        SELECT ${col}[i][1] AS src_id
        FROM generate_subscripts(${col}, 1) AS i
      ) sub
      JOIN source s ON s.finder_source_id = sub.src_id
      ${whereSql}
      GROUP BY s.finder_source_id
      ORDER BY count DESC
    `)
    return rows.map((r): SourceFacetCount => ({ finderSourceId: r.finder_source_id, count: r.count }))
  }

  if (condition.field === 'tags') {
    const col = dbSchema.cacheMedia.groupIds
    const rows = await db.execute<{ id: number, name: string, count: number }>(sql`
      SELECT g.id, g.name, COUNT(DISTINCT cache_media.id)::int AS count
      FROM cache_media
      CROSS JOIN LATERAL (
        SELECT ${col}[i][1] AS group_id
        FROM generate_subscripts(${col}, 1) AS i
        WHERE ${col}[i][2] = (SELECT id FROM "group" WHERE name = 'tags' AND parent_id IS NULL)
      ) sub
      JOIN "group" g ON g.id = sub.group_id
      ${whereSql}
      GROUP BY g.id, g.name
      ORDER BY count DESC
    `)

    const currentValues = new Set(
      Array.isArray(condition.value) ? condition.value.map(Number) : [],
    )
    const addedIfRemovedByTagId = new Map<number, number>()
    if (currentValues.size > 0) {
      const currentTotal = await countWhere(baseWhere)
      await Promise.all(
        [...currentValues].map(async (selectedId) => {
          const newValues = [...currentValues].filter(v => v !== selectedId)
          const modifiedWhere = calculateWhereValue(replaceConditionValue(body, condition.id, newValues))
          const countWithout = await countWhere(modifiedWhere)
          addedIfRemovedByTagId.set(selectedId, countWithout - currentTotal)
        }),
      )
    }

    return rows.map((r): TagFacetCount => ({
      id: r.id,
      name: r.name,
      count: r.count,
      addedIfRemoved: addedIfRemovedByTagId.get(r.id) ?? null,
    }))
  }

  if (condition.field === 'type') {
    const [row] = await db.execute<{
      video: number
      video_with_audio: number
      video_without_audio: number
      image: number
    }>(sql`
      SELECT
        SUM(CASE WHEN has_video = TRUE AND has_image = FALSE THEN 1 ELSE 0 END)::int AS video,
        SUM(CASE WHEN has_video = TRUE AND has_image = FALSE AND has_audio = TRUE THEN 1 ELSE 0 END)::int AS video_with_audio,
        SUM(CASE WHEN has_video = TRUE AND has_image = FALSE AND has_audio = FALSE THEN 1 ELSE 0 END)::int AS video_without_audio,
        SUM(CASE WHEN has_image = TRUE AND has_video = FALSE THEN 1 ELSE 0 END)::int AS image
      FROM cache_media
      ${whereSql}
    `)
    const r = row ?? { video: 0, video_with_audio: 0, video_without_audio: 0, image: 0 }
    return [
      { value: 'video', count: r.video ?? 0 },
      { value: 'video-with-audio', count: r.video_with_audio ?? 0 },
      { value: 'video-without-audio', count: r.video_without_audio ?? 0 },
      { value: 'image', count: r.image ?? 0 },
    ] satisfies TypeFacetCount[]
  }

  return []
}
