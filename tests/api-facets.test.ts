/**
 * Tests for /api/media-facets facet count logic.
 * We replicate the relevant SQL from server/api/media-facets.ts directly
 * rather than going through HTTP, so we exercise exactly the same queries.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { sql, type SQL } from 'drizzle-orm'
import {
  TEST_REQUEST,
  makeMedia,
  makeImageMedia,
  enqueueMedia,
  truncateAll,
} from './fixtures/helpers'
import { db, dbSchema } from '@@/server/utils/drizzle'
import { calculateWhereValue } from '@@/server/utils/query-builder'
import type { QueryGroupCondition, QueryFieldCondition } from '@@/types/query-condition'
import { runMediaFinderQuery } from '@@/server/lib/media-finder/run-query'

beforeEach(truncateAll)

// Helpers that mirror the facets handler SQL

function blankConditionById(condition: QueryGroupCondition, id: number): QueryGroupCondition {
  return {
    ...condition,
    conditions: condition.conditions.map(c =>
      c.type === 'field' && c.id === id ? { ...c, value: '' } : c,
    ),
  }
}

function replaceConditionValue(condition: QueryGroupCondition, id: number, newValue: unknown): QueryGroupCondition {
  return {
    ...condition,
    conditions: condition.conditions.map(c =>
      c.type === 'field' && c.id === id ? { ...c, value: newValue } : c,
    ),
  }
}

async function countWhere(where: SQL | null): Promise<number> {
  const whereSql = where ? sql`WHERE ${where}` : sql``
  const [row] = await db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM cache_media ${whereSql}`)
  return row?.count ?? 0
}

async function fetchSourceCounts(condition: QueryFieldCondition, body: QueryGroupCondition) {
  const col = dbSchema.cacheMedia.finderSourceMediaIds
  const baseWhere = calculateWhereValue(blankConditionById(body, condition.id))
  const whereSql: SQL = baseWhere ? sql`WHERE ${baseWhere}` : sql``
  return db.execute<{ finder_source_id: string, count: number }>(sql`
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
}

async function fetchTagCounts(condition: QueryFieldCondition, body: QueryGroupCondition) {
  const col = dbSchema.cacheMedia.groupIds
  const baseWhere = condition.operator === 'includes all'
    ? calculateWhereValue(body)
    : calculateWhereValue(blankConditionById(body, condition.id))
  const whereSql: SQL = baseWhere ? sql`WHERE ${baseWhere}` : sql``

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
        const modifiedCondition = replaceConditionValue(body, condition.id, newValues)
        const modifiedWhere = calculateWhereValue(modifiedCondition)
        const countWithout = await countWhere(modifiedWhere)
        addedIfRemovedByTagId.set(selectedId, countWithout - currentTotal)
      }),
    )
  }

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    count: r.count,
    addedIfRemoved: addedIfRemovedByTagId.get(r.id) ?? null,
  }))
}

async function fetchTypeCounts(condition: QueryFieldCondition, body: QueryGroupCondition) {
  const baseWhere = calculateWhereValue(blankConditionById(body, condition.id))
  const whereSql: SQL = baseWhere ? sql`WHERE ${baseWhere}` : sql``
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
  return {
    video: r.video ?? 0,
    videoWithAudio: r.video_with_audio ?? 0,
    videoWithoutAudio: r.video_without_audio ?? 0,
    image: r.image ?? 0,
  }
}

function makeBody(conditions: QueryGroupCondition['conditions'] = []): QueryGroupCondition {
  return { id: 1, type: 'group', operator: 'AND', conditions }
}

function makeSourceCondition(value: string = ''): QueryFieldCondition {
  return { id: 10, type: 'field', field: 'source', operator: 'equals', value }
}

function makeTagCondition(value: number[] = []): QueryFieldCondition {
  return { id: 20, type: 'field', field: 'tags', operator: 'includes all', value }
}

function makeTypeCondition(value: string = ''): QueryFieldCondition {
  return { id: 30, type: 'field', field: 'type', operator: 'equals', value }
}

async function getGroupId(name: string): Promise<number> {
  const g = await db.query.group.findFirst({ where: (g, { eq }) => eq(g.name, name) })
  if (!g) throw new Error(`Group not found: ${name}`)
  return g.id
}

async function seedMedia() {
  enqueueMedia([
    makeMedia({ id: 'vid-a', title: 'Video A', tags: ['cats'] }),
    makeMedia({ id: 'vid-b', title: 'Video B', tags: ['dogs'] }),
    makeImageMedia({ id: 'img-a', title: 'Image A', tags: ['cats', 'dogs'] }),
    {
      mediaFinderSource: 'test-source',
      id: 'vid-c',
      title: 'Video C (audio)',
      tags: [],
      files: [{ type: 'main', url: 'https://example.com/c.mp4', video: true, audio: true, image: false }],
    },
  ])
  await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })
}

describe('/api/media-facets — source counts', () => {
  it('counts all media per source when no source filter is active', async () => {
    await seedMedia()
    const cond = makeSourceCondition()
    const counts = await fetchSourceCounts(cond, makeBody([cond]))
    expect(counts).toHaveLength(1)
    expect(counts[0].finder_source_id).toBe('test-source')
    expect(counts[0].count).toBe(4)
  })

  it('source counts ignore the active source filter (shows totals per source)', async () => {
    await seedMedia()
    const cond = makeSourceCondition('test-source')
    const counts = await fetchSourceCounts(cond, makeBody([cond]))
    // blanked source condition → shows all 4 for test-source
    expect(counts[0].count).toBe(4)
  })

  it('source counts respect other active filters (type)', async () => {
    await seedMedia()
    const sourceCond = makeSourceCondition()
    const typeCond = makeTypeCondition('image')
    const body = makeBody([sourceCond, typeCond])
    const counts = await fetchSourceCounts(sourceCond, body)
    // type=image is active; source=image filtered to 1 (img-a)
    expect(counts[0].count).toBe(1)
  })
})

describe('/api/media-facets — tag counts', () => {
  it('counts media per tag when no tag filter is active', async () => {
    await seedMedia()
    const cond = makeTagCondition([])
    const counts = await fetchTagCounts(cond, makeBody([cond]))
    const byName = Object.fromEntries(counts.map(c => [c.name, c.count]))
    // cats: vid-a + img-a = 2
    expect(byName['cats']).toBe(2)
    // dogs: vid-b + img-a = 2
    expect(byName['dogs']).toBe(2)
  })

  it('includes-all: active tag filter limits counts shown', async () => {
    await seedMedia()
    const catsId = await getGroupId('cats')
    const cond = makeTagCondition([catsId])
    const counts = await fetchTagCounts(cond, makeBody([cond]))
    const byName = Object.fromEntries(counts.map(c => [c.name, c.count]))
    // With cats selected, baseWhere keeps the cats filter active:
    // cats: 2 (vid-a, img-a), dogs: 1 (img-a — only media with cats that also has dogs)
    expect(byName['cats']).toBe(2)
    expect(byName['dogs']).toBe(1)
  })

  it('addedIfRemoved is null when tag is not selected', async () => {
    await seedMedia()
    const cond = makeTagCondition([])
    const counts = await fetchTagCounts(cond, makeBody([cond]))
    for (const c of counts) {
      expect(c.addedIfRemoved).toBeNull()
    }
  })

  it('addedIfRemoved shows how many items would be added back if the tag were removed', async () => {
    await seedMedia()
    const catsId = await getGroupId('cats')
    const cond = makeTagCondition([catsId])
    const counts = await fetchTagCounts(cond, makeBody([cond]))
    const catsFacet = counts.find(c => c.name === 'cats')!
    // Removing cats: 4 total vs 2 with cats selected → addedIfRemoved = 2
    expect(catsFacet.addedIfRemoved).toBe(2)
  })

  it('addedIfRemoved=0 when removing the tag adds no extra items', async () => {
    // Seed only media with cats, so removing cats doesn't expose new items
    enqueueMedia([makeMedia({ id: 'only-cats', tags: ['cats'] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const catsId = await getGroupId('cats')
    const cond = makeTagCondition([catsId])
    const counts = await fetchTagCounts(cond, makeBody([cond]))
    const catsFacet = counts.find(c => c.name === 'cats')!
    // All media has cats; removing cats still gives the same count (just without filter) → 0 added
    expect(catsFacet.addedIfRemoved).toBe(0)
  })

  it('tag counts respect other active filters (type)', async () => {
    await seedMedia()
    const cond = makeTagCondition([])
    const typeCond = makeTypeCondition('image')
    const body = makeBody([cond, typeCond])
    const counts = await fetchTagCounts(cond, body)
    const byName = Object.fromEntries(counts.map(c => [c.name, c.count]))
    // With type=image, only img-a qualifies → cats:1, dogs:1
    expect(byName['cats']).toBe(1)
    expect(byName['dogs']).toBe(1)
  })
})

describe('/api/media-facets — type counts', () => {
  it('counts all type buckets correctly', async () => {
    await seedMedia()
    const cond = makeTypeCondition()
    const counts = await fetchTypeCounts(cond, makeBody([cond]))
    // vid-a, vid-b, vid-c are videos; img-a is image
    expect(counts.video).toBe(3)
    expect(counts.image).toBe(1)
    expect(counts.videoWithAudio).toBe(1) // vid-c
    expect(counts.videoWithoutAudio).toBe(2) // vid-a, vid-b
  })

  it('type counts are zero when no media exists', async () => {
    const cond = makeTypeCondition()
    const counts = await fetchTypeCounts(cond, makeBody([cond]))
    expect(counts.video).toBe(0)
    expect(counts.image).toBe(0)
    expect(counts.videoWithAudio).toBe(0)
    expect(counts.videoWithoutAudio).toBe(0)
  })

  it('type counts respect other active filters (tag)', async () => {
    await seedMedia()
    const catsId = await getGroupId('cats')
    const typeCond = makeTypeCondition()
    const tagCond = makeTagCondition([catsId])
    const body = makeBody([typeCond, tagCond])
    const counts = await fetchTypeCounts(typeCond, body)
    // With cats filter: vid-a (video, no audio) + img-a (image) → blanked type, still cats active
    // type cond is blanked, tag cond is kept
    expect(counts.video).toBe(1) // vid-a
    expect(counts.image).toBe(1) // img-a
  })

  it('type counts ignore the active type filter itself', async () => {
    await seedMedia()
    const cond = makeTypeCondition('image')
    const body = makeBody([cond])
    const counts = await fetchTypeCounts(cond, body)
    // Blanked type condition → counts over all media
    expect(counts.video).toBe(3)
    expect(counts.image).toBe(1)
  })
})

describe('/api/media-facets — cross-field interactions', () => {
  it('source count drops when tag filter reduces visible set', async () => {
    await seedMedia()
    const catsId = await getGroupId('cats')
    const sourceCond = makeSourceCondition()
    const tagCond = makeTagCondition([catsId])
    const body = makeBody([sourceCond, tagCond])
    const counts = await fetchSourceCounts(sourceCond, body)
    // tag filter keeps 2 items (vid-a, img-a); source cond blanked but tag kept
    expect(counts[0].count).toBe(2)
  })

  it('tag counts drop when type filter reduces visible set', async () => {
    await seedMedia()
    const typeCond = makeTypeCondition('video-without-audio')
    const tagCond = makeTagCondition([])
    const body = makeBody([typeCond, tagCond])
    const counts = await fetchTagCounts(tagCond, body)
    const byName = Object.fromEntries(counts.map(c => [c.name, c.count]))
    // Only vid-a (cats) and vid-b (dogs) are video-without-audio
    expect(byName['cats']).toBe(1)
    expect(byName['dogs']).toBe(1)
    expect(byName['image']).toBeUndefined()
  })
})
