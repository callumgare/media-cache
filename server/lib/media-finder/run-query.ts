import serialize from 'serialize-javascript'

import deepmerge from 'deepmerge'
import type { GenericFile, GenericMedia, GenericRequest, MediaFinderQuery } from 'media-finder'
import objectHash from 'object-hash'

import { and, eq } from 'drizzle-orm'
import { finderFileToCacheFile } from './shared'
import { getMediaQuery } from '.'
import { deserialize } from '~/lib/general'

export async function runMediaFinderQuery(mediaFinderQuery: DBMediaFinderQuery) {
  const queryOptions: ConstructorParameters<typeof MediaFinderQuery>[0]['queryOptions'] = {
    secrets: {
      apiKey: process.env.GIPHY_API_KEY,
    },
  }
  if (mediaFinderQuery.fetchCountLimit !== null) {
    queryOptions.fetchCountLimit = mediaFinderQuery.fetchCountLimit
  }
  const mediaQuery = await getMediaQuery({
    request: mediaFinderQuery.requestOptions as GenericRequest,
    queryOptions,
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
      const [queryHistoryEntry] = await db.insert(schema.MediaFinderHistory).values({
        updatedAt: new Date(),
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
      })
        .returning()

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

  return await db.query.Media.findMany({
    with: {
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
  const mediaResponses = await db.query.MediaFinderResponseItemContent.findMany({
    where: (MediaFinderResponseItemContent, { eq, and }) => and(
      eq(MediaFinderResponseItemContent.itemType, 'media'),
      eq(MediaFinderResponseItemContent.source, finderSourceId),
      eq(MediaFinderResponseItemContent.itemId, finderMediaId),
    ),
    orderBy: (MediaFinderResponseItemContent, { desc }) => [desc(MediaFinderResponseItemContent.createdAt)],
  }).then(
    responseItemContents => responseItemContents.map(responseItemContent => deserialize(responseItemContent.content) as GenericMedia),
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
): Promise<DBSourceMediaDetails> {
  const [sourceMediaDetails] = await db.update(schema.SourceMediaDetails)
    .set({
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
    })
    .where(
      and(
        eq(schema.SourceMediaDetails.finderSourceId, finderSourceId),
        eq(schema.SourceMediaDetails.finderMediaId, finderMediaId),
      ),
    )
    .returning()

  return sourceMediaDetails
}

export async function refreshFiles(
  mergedMediaResponse: GenericMedia,
  media: DBSourceMediaDetails,
) {
  const { mediaFinderSource: finderSourceId, id: finderMediaId } = mergedMediaResponse
  for (const finderFile of mergedMediaResponse.files) {
    const cacheFile = finderFileToCacheFile(finderFile)

    await db.insert(schema.File)
      .values({
        finderSourceId,
        finderMediaId,
        mediaId: media.id,
        ...cacheFile,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.File.finderSourceId, schema.File.finderMediaId, schema.File.type],
        set: {
          ...cacheFile,
          updatedAt: new Date(),
        },
      })
  }
}

export async function refreshMedia(media: DBSourceMediaDetails) {
  const sourceMediaDetails = await db.query.SourceMediaDetails.findMany({
    where: (SourceMediaDetails, { eq }) => eq(SourceMediaDetails.id, media.id),
  })
  await db.update(schema.Media)
    .set({
      draft: false,
      title: sourceMediaDetails.filter(details => details.title)[0]?.title,
      description: sourceMediaDetails.filter(details => details.description)[0]?.description,
      updatedAt: new Date(),
    })
    .where(eq(schema.Media.id, media.id))
}

async function ensureMedia(finderMedia: GenericMedia): Promise<{ media: DBSourceMediaDetails, createdMedia: boolean }> {
  const { mediaFinderSource, id } = finderMedia
  const existingSourceMediaDetails = await db.query.SourceMediaDetails.findFirst({
    where: (SourceMediaDetails, { and, eq }) => and(
      eq(SourceMediaDetails.finderSourceId, mediaFinderSource),
      eq(SourceMediaDetails.finderMediaId, id),
    ),
  })

  let sourceMediaDetails = existingSourceMediaDetails

  if (!sourceMediaDetails) {
    const [cacheMedia] = await db.insert(schema.Media)
      .values({
        title: '',
        description: '',
        draft: true,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
    let source = await db.query.Source.findFirst({
      where: (Source, { eq }) => eq(Source.finderSourceId, mediaFinderSource),
    })
    if (!source) {
      source = await db.insert(schema.Source)
        .values({
          finderSourceId: mediaFinderSource,
          updatedAt: new Date(),
        })
        .returning()
        .then(res => res[0])
      if (!source) {
        throw Error('Failed to create source')
      }
    }
    sourceMediaDetails = await db.insert(schema.SourceMediaDetails)
      .values({
        finderMediaId: id,
        finderSourceId: source.finderSourceId,
        mediaId: cacheMedia.id,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
      .then(res => res[0])
  }
  if (!sourceMediaDetails) {
    throw Error(`Could not get sourceMediaDetails`)
  }

  return {
    media: sourceMediaDetails,
    createdMedia: Boolean(existingSourceMediaDetails),
  }
}

type SaveMediaFinderResponseItemProps = {
  item: GenericMedia
  itemType: 'media'
  queryHistoryEntry: DBMediaFinderHistory
}

async function saveMediaFinderResponseItem({ item, itemType, queryHistoryEntry }: SaveMediaFinderResponseItemProps) {
  const contentHash = objectHash(item)
  const { mediaFinderSource, id } = item
  const existingResponseItemMap = await db.query.MediaFinderResponseItemMap.findFirst({
    where: (MediaFinderResponseItemMap, { eq }) => eq(MediaFinderResponseItemMap.contentHash, contentHash),
  })
  const [mediaFinderResponseItemContent] = await db.insert(schema.MediaFinderResponseItemContent)
    .values({
      source: mediaFinderSource,
      itemId: id,
      itemType,
      contentHash,
      content: serialize(item),
      updatedAt: new Date(),
    })
    .returning()
  const responseItem = await db.insert(schema.MediaFinderResponseItemMap)
    .values({
      source: mediaFinderSource,
      itemId: id,
      itemType,
      queryHistoryId: queryHistoryEntry.id,
      contentHash: mediaFinderResponseItemContent.contentHash,
      updatedAt: new Date(),
    })

  return {
    matchesExisting: !!existingResponseItemMap,
    responseItem,
  }
}
