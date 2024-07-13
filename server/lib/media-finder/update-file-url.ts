import { type File } from '@prisma/client'
import { createMediaFinderQuery } from 'media-finder'
import { type GenericRequestInput } from 'media-finder/dist/schemas/request'
import { finderFileToCacheFile } from './shared'
import prisma from '@/lib/prisma'
import { deserialize } from '~/lib/general'

export async function updateFileUrl(fileToRefresh: File) {
  if (!fileToRefresh.urlRefreshDetails) {
    throw Error(`File has not urlRefreshDetails`)
  }
  const mediaQuery = createMediaFinderQuery({
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

  const prismaTransactionOperations = []
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
      prismaTransactionOperations.push(
        prisma.file.update({
          where: {
            finderSourceId_finderMediaId_type: {
              finderMediaId: media.id,
              finderSourceId: media.mediaFinderSource,
              type: finderFile.type,
            },
          },
          data: {
            url: cacheFile.url,
            urlExpires: cacheFile.urlExpires,
            urlRefreshDetails: cacheFile.urlRefreshDetails,
          },
        }),
      )
    }
  }

  await prisma.$transaction(prismaTransactionOperations)

  if (!newUrlForGivenFile) {
    throw Error('Returned media did not contain expected file')
  }
  return newUrlForGivenFile
}
