/**
 * Integration tests for calculateBM25WhereValue.
 *
 * Rows are inserted directly into cache_media so we control finderSourceIds exactly.
 * Each test runs calculateBM25WhereValue as the WHERE clause of a real SQL query,
 * exercising the BM25 index and asserting correctness of the result set.
 *
 * Seed layout:
 *   vid-a  — finderSourceIds: ['source-a'], video (hasVideo=true, hasImage=false)
 *   vid-b  — finderSourceIds: ['source-b'], video
 *   img-a  — finderSourceIds: ['source-a'], image (hasVideo=false, hasImage=true)
 *   img-b  — finderSourceIds: ['source-b'], image
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from './fixtures/helpers'
import { db, dbSchema } from '@@/server/utils/drizzle'
import { sql } from 'drizzle-orm'
import { calculateWhereValue } from '@@/server/utils/query-builder'
import type { QueryCondition, QueryGroupCondition } from '@@/types/query-condition'

beforeEach(truncateAll)

// ─── seed ────────────────────────────────────────────────────────────────────

async function seedMedia() {
  const now = new Date()
  await db.insert(dbSchema.cacheMedia).values([
    { updatedAt: now, title: 'vid-a', finderSourceIds: ['source-a'], hasVideo: true, hasImage: false, hasAudio: false },
    { updatedAt: now, title: 'vid-b', finderSourceIds: ['source-b'], hasVideo: true, hasImage: false, hasAudio: false },
    { updatedAt: now, title: 'img-a', finderSourceIds: ['source-a'], hasVideo: false, hasImage: true, hasAudio: false },
    { updatedAt: now, title: 'img-b', finderSourceIds: ['source-b'], hasVideo: false, hasImage: true, hasAudio: false },
  ])
}

// ─── query helper ─────────────────────────────────────────────────────────────

/** Returns the titles of matching cache_media rows, sorted alphabetically. */
async function titlesWhere(condition: QueryCondition): Promise<string[]> {
  const where = calculateWhereValue(condition)
  const rows = await db.execute<{ title: string }>(sql`SELECT title FROM cache_media WHERE ${where}`)
  return rows.map((r: { title: string }) => r.title).sort()
}

// ─── condition builders ───────────────────────────────────────────────────────

let _nextId = 100
function nextId() {
  return _nextId++
}

function group(operator: 'AND' | 'OR', conditions: QueryCondition[]): QueryGroupCondition {
  return { id: nextId(), type: 'group', operator, conditions }
}
function source(value: string): QueryCondition {
  return { id: nextId(), type: 'field', field: 'source', operator: 'equals', value }
}
function mediaType(value: string): QueryCondition {
  return { id: nextId(), type: 'field', field: 'type', operator: 'equals', value }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('calculateBM25WhereValue — operator combinations', () => {
  it('empty conditions → matches all rows', async () => {
    await seedMedia()
    expect(await titlesWhere(group('AND', []))).toEqual(['img-a', 'img-b', 'vid-a', 'vid-b'])
  })

  describe('single AND group', () => {
    it('AND[source=a] → source-a rows', async () => {
      await seedMedia()
      expect(await titlesWhere(group('AND', [source('source-a')]))).toEqual(['img-a', 'vid-a'])
    })

    it('AND[source=a, type=video] → video from source-a only', async () => {
      await seedMedia()
      expect(await titlesWhere(group('AND', [source('source-a'), mediaType('video')]))).toEqual(['vid-a'])
    })

    it('AND[source=b, type=image] → image from source-b only', async () => {
      await seedMedia()
      expect(await titlesWhere(group('AND', [source('source-b'), mediaType('image')]))).toEqual(['img-b'])
    })

    it('AND[type=video] → all videos', async () => {
      await seedMedia()
      expect(await titlesWhere(group('AND', [mediaType('video')]))).toEqual(['vid-a', 'vid-b'])
    })
  })

  describe('single OR group', () => {
    it('OR[source=a, source=b] → all rows', async () => {
      await seedMedia()
      expect(await titlesWhere(group('OR', [source('source-a'), source('source-b')]))).toEqual(['img-a', 'img-b', 'vid-a', 'vid-b'])
    })

    it('OR[source=a] single child → source-a rows', async () => {
      await seedMedia()
      expect(await titlesWhere(group('OR', [source('source-a')]))).toEqual(['img-a', 'vid-a'])
    })

    it('OR[type=video, type=image] → all rows', async () => {
      await seedMedia()
      expect(await titlesWhere(group('OR', [mediaType('video'), mediaType('image')]))).toEqual(['img-a', 'img-b', 'vid-a', 'vid-b'])
    })

    it('OR[source=a, type=video] → source-a rows ∪ all videos', async () => {
      await seedMedia()
      // img-a (source-a), vid-a (source-a + video), vid-b (video) = 3 rows
      expect(await titlesWhere(group('OR', [source('source-a'), mediaType('video')]))).toEqual(['img-a', 'vid-a', 'vid-b'])
    })

    it('OR[type=image, source=b] → all images ∪ source-b rows', async () => {
      await seedMedia()
      // img-a (image), img-b (image + source-b), vid-b (source-b) = 3 rows
      expect(await titlesWhere(group('OR', [mediaType('image'), source('source-b')]))).toEqual(['img-a', 'img-b', 'vid-b'])
    })
  })

  describe('AND containing OR', () => {
    it('AND[type=video, OR[source=a, source=b]] → all videos', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('AND', [mediaType('video'), group('OR', [source('source-a'), source('source-b')])]),
      )).toEqual(['vid-a', 'vid-b'])
    })

    it('AND[source=a, OR[type=video, type=image]] → all source-a rows', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('AND', [source('source-a'), group('OR', [mediaType('video'), mediaType('image')])]),
      )).toEqual(['img-a', 'vid-a'])
    })

    it('AND[source=a, OR[source=a, source=b]] → source-a (AND narrows the OR)', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('AND', [source('source-a'), group('OR', [source('source-a'), source('source-b')])]),
      )).toEqual(['img-a', 'vid-a'])
    })
  })

  describe('OR containing AND', () => {
    it('OR[AND[source=a, type=video], AND[source=b, type=image]] → vid-a and img-b', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('OR', [
          group('AND', [source('source-a'), mediaType('video')]),
          group('AND', [source('source-b'), mediaType('image')]),
        ]),
      )).toEqual(['img-b', 'vid-a'])
    })

    it('OR[AND[source=a, type=video], AND[source=a, type=image]] → all source-a rows', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('OR', [
          group('AND', [source('source-a'), mediaType('video')]),
          group('AND', [source('source-a'), mediaType('image')]),
        ]),
      )).toEqual(['img-a', 'vid-a'])
    })
  })

  describe('deep nesting', () => {
    it('AND[AND[AND[source=a]]] → source-a rows (triple-nested AND)', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('AND', [group('AND', [group('AND', [source('source-a')])])]),
      )).toEqual(['img-a', 'vid-a'])
    })

    it('OR[OR[source=a, source=b], type=video] → all rows (outer OR broadens)', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('OR', [group('OR', [source('source-a'), source('source-b')]), mediaType('video')]),
      )).toEqual(['img-a', 'img-b', 'vid-a', 'vid-b'])
    })

    it('AND[OR[source=a, source=b], OR[type=video, type=image]] → all rows', async () => {
      await seedMedia()
      expect(await titlesWhere(
        group('AND', [
          group('OR', [source('source-a'), source('source-b')]),
          group('OR', [mediaType('video'), mediaType('image')]),
        ]),
      )).toEqual(['img-a', 'img-b', 'vid-a', 'vid-b'])
    })

    it('AND[source=a, OR[type=video, AND[source=b, type=image]]] → vid-a only', async () => {
      await seedMedia()
      // source=a AND (type=video OR (source=b AND type=image))
      // vid-a: source-a ✓, type=video ✓ → yes
      // img-a: source-a ✓, type=image but NOT source-b → no
      expect(await titlesWhere(
        group('AND', [
          source('source-a'),
          group('OR', [mediaType('video'), group('AND', [source('source-b'), mediaType('image')])]),
        ]),
      )).toEqual(['vid-a'])
    })
  })
})
