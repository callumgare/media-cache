import type { GenericRequest } from 'media-finder'
import {
  createCacheMedia, createCacheMediaSource, createFinderQueryExecution, createFinderQueryExecutionMedia, createFinderQueryExecutionMediaContent, getAllCopiesOfFinderMedia, getCacheMedia, mergeFinderMedia, createOrUpdateCacheMediaFiles, updateCacheMediaSource, updateCacheMedia,
} from './utils'
import { getMediaQuery } from '.'
import { deserialize } from '~/lib/general'

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

  mediaFinderQueryOptions.secrets = mediaFinderQueryOptions.secrets || {}
  mediaFinderQueryOptions.secrets.apiKey = process.env.GIPHY_API_KEY

  const mediaQuery = await getMediaQuery({
    request: mediaFinderRequest,
    queryOptions: mediaFinderQueryOptions,
  })

  let newMediaCount = 0
  let updatedMediaCount = 0
  let mediaUnchangedCount = 0

  for await (const response of mediaQuery) {
    if (response.page && response.page.paginationType === 'offset') {
      const statusMessage = `Downloading page number ${response.page.pageNumber}`
      console.log(statusMessage)
    }
    else if (response.page && response.page.paginationType === 'cursor') {
      const statusMessage = `Downloading page with cursor ${response.page.cursor}`
      console.log(statusMessage)
    }
    for (const finderMedia of response.media) {
      console.log('Loading media:', finderMedia.id)

      await db.transaction(async (dbTx) => {
        const finderMediaDb = await createFinderQueryExecutionMediaContent({ dbTx, finderMedia })

        if (!finderMediaDb) {
          // Media with exactly the same details has been saved previously so we can skip
          mediaUnchangedCount++
          return
        }

        await createFinderQueryExecutionMedia({
          dbTx,
          finderMedia,
          finderQueryExecution,
        })

        let cacheMedia = await getCacheMedia({ dbTx, finderMedia })

        // Since different queries can include different amounts of detail for a media if we updated cacheMediaSource with
        // just details from this latest query we could override important details that we found in a previous query. To
        // avoid this we get every result that includes this media whether from this query execution or a different one
        // and merge it into one. Then we update our cacheMedia based on this merged media query.
        const allCopiesOfFinderMedia = await getAllCopiesOfFinderMedia({
          dbTx,
          finderSourceId: finderMedia.mediaFinderSource,
          finderMediaId: finderMedia.id,
        })
        const mergedFinderMedia = await mergeFinderMedia({ finderMedias: allCopiesOfFinderMedia })

        if (!cacheMedia) {
          cacheMedia = await createCacheMedia({ dbTx, finderMedia })
          createCacheMediaSource({
            dbTx,
            cacheMedia,
            finderMedia: mergedFinderMedia,
          })
          createOrUpdateCacheMediaFiles({
            dbTx,
            finderMedia: mergedFinderMedia,
            cacheMedia,
          })
          newMediaCount++
        }
        else {
          updateCacheMedia({ dbTx, cacheMedia })
          updateCacheMediaSource({
            dbTx,
            finderMedia: mergedFinderMedia,
          })
          createOrUpdateCacheMediaFiles({
            dbTx,
            finderMedia: mergedFinderMedia,
            cacheMedia,
          })
          updatedMediaCount++
        }
      })
    }
    console.log('Done loading page')
  }
  console.log('Done running query')
  console.log({
    newMediaCount,
    updatedMediaCount,
    mediaUnchangedCount,
  })
}
