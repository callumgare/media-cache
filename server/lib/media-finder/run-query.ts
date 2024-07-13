import type { MediaFinderHistory, MediaFinderQuery, SourceMediaDetails } from '@prisma/client'
import serialize from 'serialize-javascript'

import deepmerge from 'deepmerge'
import { type GenericFile, type GenericMedia, type GenericRequest } from 'media-finder'
import objectHash from 'object-hash'

import { finderFileToCacheFile } from './shared'
import { getMediaQuery } from '.'
import prisma from '@/lib/prisma'
import { deserialize } from '~/lib/general'

export async function runMediaFinderQuery(mediaFinderQuery: MediaFinderQuery) {
  const mediaQuery = await getMediaQuery({
    request: mediaFinderQuery.requestOptions as GenericRequest,
    queryOptions: {
      fetchCountLimit: 3,
      secrets: {
        apiKey: process.env.GIPHY_API_KEY,
      },
    },
  })

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

      finderMedia.title = (finderMedia.title || '') + Math.random()
      const queryHistoryEntry = await prisma.mediaFinderHistory.create({
        data: {
          startDate: new Date(),
          endDate: new Date(),
          found: 0,
          new: 0,
          updated: 0,
          removed: 0,
          notSuitable: 0,
          unchanged: 0,
          warningCount: 0,
          nonFatalErrorCount: 0,
          fatalErrorCount: 0,
          queryId: mediaFinderQuery.id,
        },
      })

      const { media, createdMedia } = await ensureMedia(finderMedia)

      const mediaIsNew = createdMedia

      const {
        matchesExisting: responseItemMatchesExisting,
      } = await saveMediaFinderResponseItem({ item: finderMedia, itemType: 'media', queryHistoryEntry })

      const mediaIsUpdated = !mediaIsNew && !responseItemMatchesExisting

      if (mediaIsNew || mediaIsUpdated) {
        const mergedMediaResponse = await getMergedFinderResponseMedia(finderMedia.mediaFinderSource, finderMedia.id)

        await refreshSourceMediaDetails(mergedMediaResponse, finderMedia.mediaFinderSource, finderMedia.id)
        await refreshFiles(mergedMediaResponse, media)
        await refreshMedia(media)
      }
    }
    console.log('Done loading page')
  }
  console.log('Done running query')

  return await prisma.media.findMany({
    include: {
      files: true,
      sourceDetails: true,
      GroupEntry: true,
    },
  })
}

export async function getMergedFinderResponseMedia(
  finderSourceId: string,
  finderMediaId: string,
): Promise<GenericMedia> {
  const mediaResponses = await prisma.mediaFinderResponseItemContent.findMany({
    where: {
      itemType: 'media',
      source: finderSourceId,
      itemId: finderMediaId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
    ],
  }).then(
    responseItemContents => responseItemContents.map(responseItemContent => deserialize(responseItemContent.content)),
  )

  function combineFilesOfSameType(files: GenericFile[]) {
    return files.reduce<GenericFile[]>(
      (accumulator, currentFile) => {
        const indexOfExistingFile = accumulator.findIndex(fileA => fileA.type === currentFile.type)
        if (indexOfExistingFile === -1) {
          accumulator.push(currentFile)
        }
        else {
          accumulator[indexOfExistingFile] = deepmerge(accumulator[indexOfExistingFile], currentFile)
        }
        return accumulator
      },
      [],
    )
  }

  const options = {
    customMerge: (key: string) => {
      if (key === 'files') {
        return (filesA: GenericFile[], filesB: GenericFile[]) => combineFilesOfSameType([...filesA, ...filesB])
      }
      return undefined
    },
  }

  return deepmerge.all<GenericMedia>(mediaResponses, options)
}

export async function refreshSourceMediaDetails(
  mergedMediaResponse: GenericMedia,
  finderSourceId: string,
  finderMediaId: string,
): Promise<SourceMediaDetails> {
  const sourceMediaDetails = await prisma.sourceMediaDetails.update({
    where: {
      finderSourceId_finderMediaId: {
        finderSourceId,
        finderMediaId,
      },
    },
    data: {
      sourceUploadedAt: mergedMediaResponse.dateUploaded,
      title: mergedMediaResponse.title,
      description: mergedMediaResponse.description,
      url: mergedMediaResponse.url,
      creator: mergedMediaResponse.usernameOfCreator,
      uploader: mergedMediaResponse.usernameOfUploader,
      views: mergedMediaResponse.views,
      likes: mergedMediaResponse.numberOfLikes,
      likesPercentage: mergedMediaResponse.percentOfLikes,
      dislikes: mergedMediaResponse.numberOfDislikes,
    },
  })

  return sourceMediaDetails
}

export async function refreshFiles(
  mergedMediaResponse: GenericMedia,
  media: SourceMediaDetails,
) {
  const { mediaFinderSource: finderSourceId, id: finderMediaId } = mergedMediaResponse
  for (const finderFile of mergedMediaResponse.files) {
    const cacheFile = finderFileToCacheFile(finderFile)

    await prisma.file.upsert({
      where: {
        finderSourceId_finderMediaId_type: {
          finderSourceId,
          finderMediaId,
          type: finderFile.type,
        },
      },
      create: {
        finderSourceId,
        finderMediaId,
        media: {
          connect: {
            id: media.id,
          },
        },
        ...cacheFile,
      },
      update: {
        ...cacheFile,
      },
    })
  }
}

export async function refreshMedia(media: SourceMediaDetails) {
  const sourceMediaDetails = await prisma.sourceMediaDetails.findMany({
    where: {
      media: {
        id: media.id,
      },
    },
  })
  await prisma.media.update({
    where: {
      id: media.id,
    },
    data: {
      draft: false,
      title: sourceMediaDetails.filter(details => details.title)[0]?.title,
      description: sourceMediaDetails.filter(details => details.description)[0]?.description,
    },
  })
}

async function ensureMedia(finderMedia: GenericMedia): Promise<{ media: SourceMediaDetails, createdMedia: boolean }> {
  const { mediaFinderSource, id } = finderMedia
  const existingSourceMediaDetails = await prisma.sourceMediaDetails.findUnique({
    where: {
      finderSourceId_finderMediaId: {
        finderSourceId: mediaFinderSource,
        finderMediaId: id,
      },
    },
  })

  let media = existingSourceMediaDetails

  if (!media) {
    media = await prisma.sourceMediaDetails.upsert({
      where: {
        finderSourceId_finderMediaId: {
          finderSourceId: mediaFinderSource,
          finderMediaId: id,
        },
      },
      update: {}, // Update is empty so no update occurs
      create: {
        finderMediaId: id,
        source: {
          connectOrCreate: {
            where: {
              finderSourceId: mediaFinderSource,
            },
            create: {
              finderSourceId: mediaFinderSource,
            },
          },
        },
        media: {
          create: {
            title: '',
            description: '',
            draft: true,
          },
        },
      },
    })
  }

  return {
    media,
    createdMedia: Boolean(existingSourceMediaDetails),
  }
}

type SaveMediaFinderResponseItemProps = {
  item: GenericMedia
  itemType: 'media'
  queryHistoryEntry: MediaFinderHistory
}

async function saveMediaFinderResponseItem({ item, itemType, queryHistoryEntry }: SaveMediaFinderResponseItemProps) {
  const contentHash = objectHash(item)
  const { mediaFinderSource, id } = item
  const existingResponseItemMap = await prisma.mediaFinderResponseItemMap.findFirst({
    where: {
      contentHash,
    },
  })
  const responseItem = await prisma.mediaFinderResponseItemMap.create({
    data: {
      source: mediaFinderSource,
      itemId: id,
      itemType,
      queryHistory: {
        connect: {
          id: queryHistoryEntry.id,
        },
      },
      content: {
        connectOrCreate: {
          create: {
            source: mediaFinderSource,
            itemId: id,
            itemType,
            contentHash,
            content: serialize(item),
          },
          where: {
            contentHash,
          },
        },
      },

    },
  })

  return {
    matchesExisting: !!existingResponseItemMap,
    responseItem,
  }
}
