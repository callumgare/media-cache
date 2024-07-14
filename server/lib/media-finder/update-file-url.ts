import { type GenericRequestInput } from 'media-finder/dist/schemas/request'
import { and, eq } from 'drizzle-orm'
import { finderFileToCacheFile } from './shared'
import { getMediaQuery } from '.'
import { deserialize } from '~/lib/general'

export async function updateFileUrl(fileToRefresh: DBFile) {
  if (!fileToRefresh.urlRefreshDetails) {
    throw Error(`File has not urlRefreshDetails`)
  }
  const mediaQuery = await getMediaQuery({
    request: deserialize(fileToRefresh.urlRefreshDetails) as GenericRequestInput,
    queryOptions: {
      fetchCountLimit: 3,
      secrets: {
        apiKey: process.env.GIPHY_API_KEY,
      },
    },
  })

  const response = await mediaQuery.getNext()

  if (response === null) {
    throw Error('Could not refresh files')
  }

  const transactionOperations = []
  let newUrlForGivenFile
  for (const media of response?.media || []) {
    for (const finderFile of media.files) {
      const cacheFile = finderFileToCacheFile(finderFile)
      if (
        (fileToRefresh.finderMediaId === media.id)
        && (fileToRefresh.finderSourceId === media.mediaFinderSource)
        && (fileToRefresh.type === finderFile.type)
      ) {
        newUrlForGivenFile = finderFile.url
      }
      transactionOperations.push(
        db.update(schema.File)
          .set({
            url: cacheFile.url,
            urlExpires: cacheFile.urlExpires,
            urlRefreshDetails: cacheFile.urlRefreshDetails,
          })
          .where(and(
            eq(schema.File.finderMediaId, media.id),
            eq(schema.File.finderSourceId, media.mediaFinderSource),
            eq(schema.File.type, finderFile.type),
          )),
      )
    }
  }

  await Promise.all(transactionOperations)

  if (!newUrlForGivenFile) {
    throw Error('Returned media did not contain expected file')
  }
  return newUrlForGivenFile
}
