import type { GenericMedia, GenericRequest } from 'media-finder'
import { getSecrets } from 'media-finder/dist/test/utils/general.js'
import {
  createCacheMedia, createFinderQueryExecution, createFinderQueryMedia, createFinderQueryMediaContent,
  getCacheMedia, updateCacheMedia,
  createOrUpdateCacheMediaGroups, getPreviousFinderQueryExecution, getChangedPairs,
  deleteCacheMediaEntry, deleteOldFinderQueryMedia, finalizeFinderQueryExecution,
} from './utils'
import { getMediaQuery } from '.'
import { deserialize } from '~/server/lib/general'

import { db } from '@/server/utils/drizzle'
import type { dbSchema } from '@/server/utils/drizzle'

type MediaFinderQueryOptions = Parameters<typeof getMediaQuery>[0]['queryOptions']

export async function runDbMediaFinderQuery(dbFinderQuery: dbSchema.FinderQuery) {
  const mediaFinderRequest = deserialize(dbFinderQuery.requestOptions) as GenericRequest
  const mediaFinderQueryOptions: MediaFinderQueryOptions = {}
  if (dbFinderQuery.fetchCountLimit !== null) {
    mediaFinderQueryOptions.fetchCountLimit = dbFinderQuery.fetchCountLimit
  }
  return await runMediaFinderQuery({ mediaFinderRequest, mediaFinderQueryOptions, dbFinderQuery })
}

export async function runMediaFinderQuery({
  mediaFinderRequest,
  mediaFinderQueryOptions = {},
  dbFinderQuery,
}: {
  mediaFinderRequest: GenericRequest
  mediaFinderQueryOptions?: MediaFinderQueryOptions
  dbFinderQuery?: dbSchema.FinderQuery
}) {
  const finderQueryExecution = await createFinderQueryExecution({ dbFinderQuery })

  mediaFinderQueryOptions.secrets = {
    ...mediaFinderQueryOptions.secrets,
    ...(await getSecrets(mediaFinderRequest)),
  }

  const mediaQuery = await getMediaQuery({
    request: mediaFinderRequest,
    queryOptions: mediaFinderQueryOptions,
  })

  // Phase 1: Download all results and record them in finder_query_media
  let mediaFoundCount = 0
  let pageCount = 0
  for await (const response of mediaQuery) {
    pageCount++
    if (response.page && response.page.paginationType === 'offset') {
      console.log(`Downloading page number ${response.page.pageNumber}`)
    }
    else if (response.page && response.page.paginationType === 'cursor') {
      console.log(`Downloading page with cursor ${response.page.cursor}`)
    }
    for (const finderMedia of response.media) {
      console.log('Loading media:', finderMedia.id)
      await db.transaction(async (dbTx) => {
        await createFinderQueryMediaContent({ dbTx, finderMedia })
        await createFinderQueryMedia({ dbTx, finderMedia, finderQueryExecution })
      })
      mediaFoundCount++
    }
    console.log('Done loading page')
  }
  console.log('Done downloading query results')

  // Phase 2: Diff against previous run, then create/update/delete cache_media accordingly

  const previousExecution = dbFinderQuery
    ? await getPreviousFinderQueryExecution({ queryId: dbFinderQuery.id, currentExecutionId: finderQueryExecution.id })
    : null

  const { added, updated, removed } = await getChangedPairs({
    currentExecutionId: finderQueryExecution.id,
    previousExecutionId: previousExecution?.id ?? null,
  })

  console.log(`Changes: ${added.length} added, ${updated.length} updated, ${removed.length} removed`)

  // Build a map of pairKey → contentHash for the current execution so Phase 2 only reads
  // the exact content that belongs to this run (not stale historical records).
  const currentContentHashByPair = new Map(
    [...added, ...updated].map(p => [`${p.finderSourceId}:${p.finderMediaId}`, p.contentHash]),
  )

  async function fetchCurrentMedia(pairKey: string): Promise<GenericMedia | null> {
    const contentHash = currentContentHashByPair.get(pairKey)
    if (!contentHash) return null
    const row = await db.query.finderQueryMediaContent.findFirst({
      where: (c, { eq }) => eq(c.contentHash, contentHash),
    })
    return row ? (deserialize(row.content) as GenericMedia) : null
  }

  // Expand the set of changed pairs to include all source/media pairs that share a cache_media
  // with any of the changed pairs, so multi-source cache_media entries are fully rebuilt.
  const allChangedPairs = [...added, ...updated, ...removed]
  const affectedCacheMediaMap = new Map<number, { cacheMedia: dbSchema.CacheMedia, pairKeys: Set<string> }>()

  for (const pair of allChangedPairs) {
    const cacheMedia = await getCacheMedia({ finderSourceId: pair.finderSourceId, finderMediaId: pair.finderMediaId })
    if (cacheMedia) {
      const entry = affectedCacheMediaMap.get(cacheMedia.id) ?? { cacheMedia, pairKeys: new Set() }
      for (const [src, mid] of cacheMedia.finderSourceMediaIds) {
        entry.pairKeys.add(`${src}:${mid}`)
      }
      affectedCacheMediaMap.set(cacheMedia.id, entry)
    }
  }

  let mediaNewCount = 0
  let mediaUpdatedCount = 0
  let mediaRemovedCount = 0
  const handledAddedPairKeys = new Set<string>()

  for (const { cacheMedia, pairKeys } of affectedCacheMediaMap.values()) {
    const pairsWithContent: GenericMedia[] = []

    for (const pairKey of pairKeys) {
      const media = await fetchCurrentMedia(pairKey)
      if (media) pairsWithContent.push(media)
    }

    if (pairsWithContent.length === 0) {
      await db.transaction(async (dbTx) => {
        await deleteCacheMediaEntry({ cacheMedia, deletionReason: 'all_sources_removed', dbTx })
      })
      mediaRemovedCount++
    }
    else {
      await db.transaction(async (dbTx) => {
        await updateCacheMedia({ existingCacheMedia: cacheMedia, allFinderMedias: pairsWithContent, dbTx })
        await createOrUpdateCacheMediaGroups({ finderMedias: pairsWithContent, cacheMedia, dbTx })
      })
      mediaUpdatedCount++
    }

    for (const pair of added) {
      if (pairKeys.has(`${pair.finderSourceId}:${pair.finderMediaId}`)) {
        handledAddedPairKeys.add(`${pair.finderSourceId}:${pair.finderMediaId}`)
      }
    }
  }

  // Create cache_media for added pairs that had no existing cache_media
  for (const pair of added) {
    if (handledAddedPairKeys.has(`${pair.finderSourceId}:${pair.finderMediaId}`)) continue

    const pairKey = `${pair.finderSourceId}:${pair.finderMediaId}`
    const finderMedia = await fetchCurrentMedia(pairKey)
    if (!finderMedia) continue

    await db.transaction(async (dbTx) => {
      const cacheMedia = await createCacheMedia({ finderMedias: [finderMedia], dbTx })
      await createOrUpdateCacheMediaGroups({ finderMedias: [finderMedia], cacheMedia, dbTx })
    })
    mediaNewCount++
  }

  // Clean up old finder_query_media records and update execution stats
  if (dbFinderQuery) {
    await deleteOldFinderQueryMedia({ queryId: dbFinderQuery.id, currentExecutionId: finderQueryExecution.id })
  }
  await finalizeFinderQueryExecution({
    executionId: finderQueryExecution.id,
    stats: { pageCount, mediaFound: mediaFoundCount, mediaNew: mediaNewCount, mediaUpdated: mediaUpdatedCount, mediaRemoved: mediaRemovedCount },
  })

  console.log('Done running query')
  console.log({ mediaFoundCount, mediaNewCount, mediaUpdatedCount, mediaRemovedCount })
}
