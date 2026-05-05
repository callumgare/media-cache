import { describe, it, expect, beforeEach } from 'vitest'
import { db, dbSchema } from '@@/server/utils/drizzle'
import { runMediaFinderQuery } from '@@/server/lib/media-finder/run-query'
import {
  TEST_REQUEST,
  makeMedia,
  makeImageMedia,
  enqueueMedia,
  truncateAll,
  getCacheMediaAll,
  getDeletedCacheMediaAll,
  getFinderQueryExecutionAll,
  getFinderQueryMediaAll,
} from '@@/tests/fixtures/helpers'

beforeEach(truncateAll)

describe('runMediaFinderQuery — basic lifecycle', () => {
  it('creates cache_media for new media', async () => {
    const m = makeMedia({ id: 'media-1', title: 'Hello World' })
    enqueueMedia([m])

    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Hello World')
    expect(all[0].finderSourceIds).toEqual(['test-source'])
    expect(all[0].finderSourceMediaIds).toEqual(['test-source\tmedia-1'])
  })

  it('creates multiple cache_media entries for multiple media', async () => {
    enqueueMedia([makeMedia({ id: 'a' }), makeMedia({ id: 'b' }), makeMedia({ id: 'c' })])

    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(3)
  })

  it('records a finderQueryExecution row', async () => {
    enqueueMedia([makeMedia()])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const executions = await getFinderQueryExecutionAll()
    expect(executions).toHaveLength(1)
    expect(executions[0].mediaFound).toBe(1)
    expect(executions[0].mediaNew).toBe(1)
    expect(executions[0].mediaUpdated).toBe(0)
    expect(executions[0].mediaRemoved).toBe(0)
  })

  it('populates hasVideo / hasImage flags from the main file', async () => {
    const video = makeMedia({ id: 'vid' })
    const image = makeImageMedia({ id: 'img' })
    enqueueMedia([video, image])

    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getCacheMediaAll()
    const vidRow = all.find(r => r.finderSourceMediaIds.includes('test-source\tvid'))!
    const imgRow = all.find(r => r.finderSourceMediaIds.includes('test-source\timg'))!

    expect(vidRow.hasVideo).toBe(true)
    expect(vidRow.hasImage).toBe(false)
    expect(imgRow.hasImage).toBe(true)
    expect(imgRow.hasVideo).toBe(false)
  })
})

describe('runMediaFinderQuery — second run, no changes', () => {
  it('does not create duplicate cache_media on unchanged second run', async () => {
    const m = makeMedia({ id: 'stable' })
    enqueueMedia([m])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: await makeDbFinderQuery() })

    enqueueMedia([m])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: await makeDbFinderQuery() })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(1)
  })

  it('records mediaUpdated=0 when nothing changed', async () => {
    const q = await makeDbFinderQuery()
    const m = makeMedia({ id: 'stable' })

    enqueueMedia([m])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([m])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const execs = await getFinderQueryExecutionAll()
    const second = execs.sort((a, b) => b.id - a.id)[0]!
    expect(second.mediaUpdated).toBe(0)
    expect(second.mediaNew).toBe(0)
  })
})

describe('runMediaFinderQuery — update', () => {
  it('updates cache_media when media content changes', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'upd', title: 'Old Title' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([makeMedia({ id: 'upd', title: 'New Title' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('New Title')
  })

  it('records mediaUpdated=1 on content change', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'upd', title: 'v1' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([makeMedia({ id: 'upd', title: 'v2' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const execs = await getFinderQueryExecutionAll()
    const second = execs.sort((a, b) => b.id - a.id)[0]!
    expect(second.mediaUpdated).toBe(1)
    expect(second.mediaNew).toBe(0)
  })
})

describe('runMediaFinderQuery — removal', () => {
  it('deletes cache_media when media is no longer in results', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'gone' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([]) // empty second run
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    expect(await getCacheMediaAll()).toHaveLength(0)
  })

  it('inserts a deleted_cache_media record on removal', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'gone' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const [before] = await getCacheMediaAll()
    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const deleted = await getDeletedCacheMediaAll()
    expect(deleted).toHaveLength(1)
    expect(deleted[0].cacheMediaId).toBe(before!.id)
    expect(deleted[0].mergedIntoCacheMediaId).toBeNull()
    expect(deleted[0].deletionReason).toBe('all_sources_removed')
  })

  it('records mediaRemoved=1 on deletion', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'gone' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const execs = await getFinderQueryExecutionAll()
    const second = execs.sort((a, b) => b.id - a.id)[0]!
    expect(second.mediaRemoved).toBe(1)
  })
})

describe('runMediaFinderQuery — re-add after removal', () => {
  it('creates a fresh cache_media when re-added after removal', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'cycle' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    expect(await getCacheMediaAll()).toHaveLength(0)

    enqueueMedia([makeMedia({ id: 'cycle', title: 'Back Again' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Back Again')
  })

  it('accumulates two deleted_cache_media records after remove-readd-remove', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'cycle2' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([makeMedia({ id: 'cycle2' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    expect(await getDeletedCacheMediaAll()).toHaveLength(2)
    expect(await getCacheMediaAll()).toHaveLength(0)
  })
})

describe('runMediaFinderQuery — tags', () => {
  it('creates group rows for tags and links them via groupIds', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'tagged', tags: ['cats', 'dogs'] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const all = await getCacheMediaAll()
    expect(all).toHaveLength(1)
    const groupIds = all[0].groupIds
    expect(groupIds).toHaveLength(2)

    const groups = await db.select().from(dbSchema.group)
    const tagNames = groups.filter(g => g.parentId !== null).map(g => g.name)
    expect(tagNames).toContain('cats')
    expect(tagNames).toContain('dogs')
  })

  it('updates tags when media tags change', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'tagged2', tags: ['alpha'] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([makeMedia({ id: 'tagged2', tags: ['beta'] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const all = await getCacheMediaAll()
    expect(all[0].groupIds).toHaveLength(1)
    const betaGroup = await db.query.group.findFirst({ where: (g, { eq }) => eq(g.name, 'beta') })
    expect(betaGroup).toBeDefined()
    const alphaGroup = await db.query.group.findFirst({ where: (g, { eq }) => eq(g.name, 'alpha') })
    // alpha group still exists in the DB but no cache_media should reference it
    const isLinked = all[0].groupIds.some(pair => pair[0] === alphaGroup?.id)
    expect(isLinked).toBe(false)
  })

  it('removes groupIds when all tags are stripped', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'notags', tags: ['removeme'] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    enqueueMedia([makeMedia({ id: 'notags', tags: [] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const all = await getCacheMediaAll()
    expect(all[0].groupIds).toHaveLength(0)
  })
})

describe('runMediaFinderQuery — cleanup', () => {
  it('deletes old finder_query_media rows after second run', async () => {
    const q = await makeDbFinderQuery()
    enqueueMedia([makeMedia({ id: 'cleanup' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    const afterFirst = await getFinderQueryMediaAll()
    expect(afterFirst).toHaveLength(1)

    enqueueMedia([makeMedia({ id: 'cleanup' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST, dbFinderQuery: q })

    // Only the current execution's row should remain
    const afterSecond = await getFinderQueryMediaAll()
    expect(afterSecond).toHaveLength(1)

    const execs = await getFinderQueryExecutionAll()
    const latest = execs.sort((a, b) => b.id - a.id)[0]!
    expect(afterSecond[0].queryExecutionId).toBe(latest.id)
  })

  it('does not delete finder_query_media when no dbFinderQuery is given', async () => {
    // Without a dbFinderQuery, deleteOldFinderQueryMedia is skipped
    enqueueMedia([makeMedia({ id: 'no-query' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getFinderQueryMediaAll()
    expect(all).toHaveLength(1)
  })
})

describe('runMediaFinderQuery — aggregation', () => {
  it('aggregates views as sum across sources', async () => {
    // Two media from the same "source" with views — they are independent cache entries
    enqueueMedia([
      makeMedia({ id: 'v1', views: 100 }),
      makeMedia({ id: 'v2', views: 200 }),
    ])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getCacheMediaAll()
    const views = all.map(r => r.views).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(views).toEqual([100, 200])
  })

  it('picks first truthy title from sources', async () => {
    enqueueMedia([makeMedia({ id: 'titled', title: 'First Title' })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const all = await getCacheMediaAll()
    expect(all[0].title).toBe('First Title')
  })

  it('stores sources jsonb with correct fields', async () => {
    const m = makeMedia({ id: 'src-test', title: 'Source Test', views: 42 })
    enqueueMedia([m])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const [row] = await getCacheMediaAll()
    const sources = row.sources ?? []
    expect(sources).toHaveLength(1)
    expect(sources[0].finderSourceId).toBe('test-source')
    expect(sources[0].finderMediaId).toBe('src-test')
    expect(sources[0].views).toBe(42)
  })

  it('stores the file url correctly', async () => {
    enqueueMedia([makeMedia({ id: 'file-test', files: [{ type: 'main', url: 'https://example.com/vid.mp4', video: true, audio: false, image: false }] })])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const [row] = await getCacheMediaAll()
    expect(row.files?.[0].url).toBe('https://example.com/vid.mp4')
  })
})

describe('runMediaFinderQuery — empty query', () => {
  it('creates no cache_media when query returns no results', async () => {
    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    expect(await getCacheMediaAll()).toHaveLength(0)
  })

  it('still records a finderQueryExecution with mediaFound=0', async () => {
    enqueueMedia([])
    await runMediaFinderQuery({ mediaFinderRequest: TEST_REQUEST })

    const execs = await getFinderQueryExecutionAll()
    expect(execs).toHaveLength(1)
    expect(execs[0].mediaFound).toBe(0)
  })
})

// Helper: create a db finder_query row for linking executions
async function makeDbFinderQuery() {
  const [row] = await db
    .insert(dbSchema.finderQuery)
    .values({
      title: 'Test Query',
      requestOptions: JSON.stringify(TEST_REQUEST),
      schedule: 0,
      updatedAt: new Date(),
    })
    .returning()
  return row!
}
