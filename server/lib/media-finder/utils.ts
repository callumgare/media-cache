import objectHash from 'object-hash'
import type { GenericMedia, GenericFile } from 'media-finder'
import deepmerge from 'deepmerge'
import { and, eq, type ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'

import { finderFileToCacheFile } from './shared'
import { deserialize, serialize } from '~/server/lib/general'
import { db, dbSchema } from '@/server/utils/drizzle'

type DbTransaction = PgTransaction<PostgresJsQueryResultHKT, typeof dbSchema, ExtractTablesWithRelations<typeof dbSchema>>

export async function createFinderQueryExecution({
  dbFinderQuery,
}: {
  dbFinderQuery?: dbSchema.FinderQuery
}) {
  return db.insert(dbSchema.finderQueryExecution)
    .values({
      updatedAt: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      mediaFound: 0,
      mediaNew: 0,
      mediaUpdated: 0,
      mediaRemoved: 0,
      mediaNotSuitable: 0,
      mediaUnchanged: 0,
      warningCount: 0,
      nonFatalErrorCount: 0,
      fatalErrorCount: 0,
      queryId: dbFinderQuery?.id ?? null,
    })
    .returning()
    .then(result => result[0])
}

type CreateFinderQueryExecutionMediaProps = {
  finderMedia: GenericMedia
  finderQueryExecution: dbSchema.FinderQueryExecution
  dbTx: DbTransaction
}

export async function createFinderQueryExecutionMedia({ dbTx, finderMedia, finderQueryExecution }: CreateFinderQueryExecutionMediaProps) {
  const contentHash = objectHash(finderMedia)
  const { mediaFinderSource, id } = finderMedia

  return await dbTx.insert(dbSchema.finderQueryExecutionMedia)
    .values({
      updatedAt: new Date(),
      source: mediaFinderSource,
      mediaId: id,
      queryExecutionId: finderQueryExecution.id,
      contentHash: contentHash,
    })
    .returning()
    .then(result => result[0])
}

type SaveFinderMediaProps = {
  finderMedia: GenericMedia
  dbTx: DbTransaction
}

export async function createFinderQueryExecutionMediaContent({ dbTx, finderMedia }: SaveFinderMediaProps) {
  const contentHash = objectHash(finderMedia)
  const { mediaFinderSource, id } = finderMedia

  return dbTx.insert(dbSchema.finderQueryExecutionMediaContent)
    .values({
      source: mediaFinderSource,
      mediaId: id,
      contentHash,
      content: serialize(finderMedia),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: dbSchema.finderQueryExecutionMediaContent.contentHash })
    .returning()
    .then(result => result[0])
}

export async function getCacheMedia({
  finderMedia,
  dbTx,
}: {
  finderMedia: GenericMedia
  dbTx: DbTransaction
}): Promise<dbSchema.CacheMedia | null> {
  const { mediaFinderSource, id } = finderMedia
  // To find out if a cacheMedia already exists for media finder media we need to check for a
  // related cacheMediaSource
  const cacheMediaSource = await dbTx.query.cacheMediaSource.findFirst({
    where: (cacheMediaSource, { and, eq }) => and(
      eq(cacheMediaSource.finderSourceId, mediaFinderSource),
      eq(cacheMediaSource.finderMediaId, id),
    ),
    with: {
      media: true,
    },
  })

  if (!cacheMediaSource?.media) {
    if (cacheMediaSource) {
      console.warn('cacheMediaSource exists but corresponding cacheMedia can not be found')
    }
    return null
  }

  return cacheMediaSource.media
}

export async function getAllCopiesOfFinderMedia({
  finderSourceId,
  finderMediaId,
  dbTx,
}: {
  finderSourceId: string
  finderMediaId: string
  dbTx: DbTransaction
}): Promise<GenericMedia[]> {
  const finderMedias = await dbTx.query.finderQueryExecutionMediaContent.findMany({
    where: (MediaFinderResponseItemContent, { eq, and }) => and(
      eq(MediaFinderResponseItemContent.source, finderSourceId),
      eq(MediaFinderResponseItemContent.mediaId, finderMediaId),
    ),
    orderBy: (MediaFinderResponseItemContent, { desc }) => [desc(MediaFinderResponseItemContent.createdAt)],
  }).then(
    responseItemContents => responseItemContents.map(responseItemContent => deserialize(responseItemContent.content) as GenericMedia),
  )
  return finderMedias
}

export async function mergeFinderMedia({ finderMedias }: { finderMedias: GenericMedia[] }): Promise<GenericMedia> {
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

  return deepmerge.all<GenericMedia>(finderMedias, options)
}

export async function createCacheMedia({
  finderMedia,
  dbTx,
}: {
  finderMedia: GenericMedia
  dbTx: DbTransaction
}): Promise<dbSchema.CacheMedia> {
  const [cacheMedia] = await dbTx.insert(dbSchema.cacheMedia)
    .values({
      title: finderMedia.title,
      description: finderMedia.description,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()

  return cacheMedia
}

export async function updateCacheMedia({
  cacheMedia,
  dbTx,
}: {
  cacheMedia: dbSchema.CacheMedia
  dbTx: DbTransaction
}): Promise<void> {
  await dbTx.update(dbSchema.cacheMedia)
    .set({
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dbSchema.cacheMedia.id, cacheMedia.id),
      ),
    )
}

export async function createCacheMediaSource({
  cacheMedia,
  finderMedia,
  dbTx,
}: {
  cacheMedia: dbSchema.CacheMedia
  finderMedia: GenericMedia
  dbTx: DbTransaction
}): Promise<dbSchema.CacheMediaSource> {
  const { mediaFinderSource: finderSourceId, id: finderMediaId } = finderMedia
  let source = await dbTx.query.source.findFirst({
    where: (source, { eq }) => eq(source.finderSourceId, finderSourceId),
  })
  if (!source) {
    source = await dbTx.insert(dbSchema.source)
      .values({
        updatedAt: new Date(),
        finderSourceId,
      })
      .returning()
      .then(res => res[0])
    if (!source) {
      throw Error('Failed to create source')
    }
  }
  const sourceMediaDetails = await dbTx.insert(dbSchema.cacheMediaSource)
    .values({
      finderMediaId: finderMediaId,
      finderSourceId: source.finderSourceId,
      cacheMediaId: cacheMedia.id,
      updatedAt: new Date(),
      sourceUploadedAt: finderMedia.dateUploaded,
      title: finderMedia.title,
      description: finderMedia.description,
      url: finderMedia.url,
      creator: finderMedia.usernameOfCreator,
      uploader: finderMedia.usernameOfUploader,
      views: finderMedia.views,
      likes: finderMedia.numberOfLikes,
      likesPercentage: finderMedia.percentOfLikes,
      dislikes: finderMedia.numberOfDislikes,
    })
    .onConflictDoNothing()
    .returning()
    .then(res => res[0])

  return sourceMediaDetails
}

export async function updateCacheMediaSource({
  finderMedia,
  dbTx,
}: {
  finderMedia: GenericMedia
  dbTx: DbTransaction
}): Promise<dbSchema.CacheMediaSource> {
  const { mediaFinderSource: finderSourceId, id: finderMediaId } = finderMedia
  const [sourceMediaDetails] = await dbTx.update(dbSchema.cacheMediaSource)
    .set({
      updatedAt: new Date(),
      sourceUploadedAt: finderMedia.dateUploaded,
      title: finderMedia.title,
      description: finderMedia.description,
      url: finderMedia.url,
      creator: finderMedia.usernameOfCreator,
      uploader: finderMedia.usernameOfUploader,
      views: finderMedia.views,
      likes: finderMedia.numberOfLikes,
      likesPercentage: finderMedia.percentOfLikes,
      dislikes: finderMedia.numberOfDislikes,
    })
    .where(
      and(
        eq(dbSchema.cacheMediaSource.finderSourceId, finderSourceId),
        eq(dbSchema.cacheMediaSource.finderMediaId, finderMediaId),
      ),
    )
    .returning()

  return sourceMediaDetails
}

// TODO: Delete files that exists in db but are no longer returned in query results
export async function createOrUpdateCacheMediaFiles({
  finderMedia,
  cacheMedia,
  dbTx,
}: {
  finderMedia: GenericMedia
  cacheMedia: dbSchema.CacheMedia
  dbTx: DbTransaction
}) {
  const { mediaFinderSource: finderSourceId, id: finderMediaId } = finderMedia
  for (const finderFile of finderMedia.files) {
    const cacheFile = finderFileToCacheFile(finderFile)

    await dbTx.insert(dbSchema.cacheMediaFile)
      .values({
        finderSourceId,
        finderMediaId,
        mediaId: cacheMedia.id,
        ...cacheFile,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [dbSchema.cacheMediaFile.finderSourceId, dbSchema.cacheMediaFile.finderMediaId, dbSchema.cacheMediaFile.type],
        set: {
          ...cacheFile,
          updatedAt: new Date(),
        },
      })
  }
}

// TODO deal with tags that have since been removed
export async function createOrUpdateCacheMediaGroups({
  finderMedia,
  cacheMedia,
  dbTx,
}: {
  finderMedia: GenericMedia
  cacheMedia: dbSchema.CacheMedia
  dbTx: DbTransaction
}) {
  for (const tag of finderMedia.tags || []) {
    let [group] = await dbTx.select().from(dbSchema.group).where(eq(dbSchema.group.name, tag))
    if (!group) {
      group = await dbTx.insert(dbSchema.group)
        .values({
          name: tag,
          updatedAt: new Date(),
        })
        .returning()
        .then(rows => rows[0])
    }
    await dbTx.insert(dbSchema.cacheMediaGroup)
      .values({
        groupId: group.id,
        mediaId: cacheMedia.id,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
  }
}
