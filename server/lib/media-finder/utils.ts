import objectHash from 'object-hash'
import type { GenericMedia, GenericFile } from 'media-finder'
import deepmerge from 'deepmerge'
import { and, eq, inArray, isNull, ne, sql, type ExtractTablesWithRelations } from 'drizzle-orm'
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
    .then((result) => {
      const execution = result[0]
      if (!execution) throw new Error('Failed to create finder query execution')
      return execution
    })
}

export async function createFinderQueryMedia({
  dbTx,
  finderMedia,
  finderQueryExecution,
}: {
  finderMedia: GenericMedia
  finderQueryExecution: dbSchema.FinderQueryExecution
  dbTx: DbTransaction
}) {
  const contentHash = objectHash(finderMedia)
  return dbTx.insert(dbSchema.finderQueryMedia)
    .values({
      updatedAt: new Date(),
      finderSourceId: finderMedia.mediaFinderSource,
      finderMediaId: String(finderMedia.id),
      queryExecutionId: finderQueryExecution.id,
      contentHash,
    })
    .returning()
    .then(result => result[0])
}

export async function createFinderQueryMediaContent({
  dbTx,
  finderMedia,
}: {
  finderMedia: GenericMedia
  dbTx: DbTransaction
}) {
  const contentHash = objectHash(finderMedia)
  return dbTx.insert(dbSchema.finderQueryMediaContent)
    .values({
      finderSourceId: finderMedia.mediaFinderSource,
      finderMediaId: String(finderMedia.id),
      contentHash,
      content: serialize(finderMedia),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: dbSchema.finderQueryMediaContent.contentHash })
    .returning()
    .then(result => result[0])
}

export async function getCacheMedia({
  finderSourceId,
  finderMediaId,
}: {
  finderSourceId: string
  finderMediaId: string
}): Promise<dbSchema.CacheMedia | null> {
  const [result] = await db
    .select()
    .from(dbSchema.cacheMedia)
    .where(sql`EXISTS (
      SELECT 1
      FROM generate_subscripts(${dbSchema.cacheMedia.finderSourceMediaIds}, 1) AS i
      WHERE ${dbSchema.cacheMedia.finderSourceMediaIds}[i][1] = ${finderSourceId}
      AND ${dbSchema.cacheMedia.finderSourceMediaIds}[i][2] = ${finderMediaId}
    )`)
    .limit(1)
  return result ?? null
}

export async function getAllCopiesOfFinderMedia({
  finderSourceId,
  finderMediaId,
}: {
  finderSourceId: string
  finderMediaId: string
}): Promise<GenericMedia[]> {
  return db.query.finderQueryMediaContent.findMany({
    where: (content, { eq, and }) => and(
      eq(content.finderSourceId, finderSourceId),
      eq(content.finderMediaId, finderMediaId),
    ),
    orderBy: (content, { desc }) => [desc(content.createdAt)],
  }).then(items => items.map(item => deserialize(item.content) as GenericMedia))
}

export async function mergeFinderMedia({ finderMedias }: { finderMedias: GenericMedia[] }): Promise<GenericMedia> {
  function combineFilesOfSameType(files: GenericFile[]) {
    return files.reduce<GenericFile[]>(
      (acc, file) => {
        const idx = acc.findIndex(f => f.type === file.type)
        if (idx === -1) acc.push(file)
        else acc[idx] = deepmerge(acc[idx], file)
        return acc
      },
      [],
    )
  }

  return deepmerge.all<GenericMedia>(finderMedias, {
    customMerge: key => key === 'files'
      ? (a: GenericFile[], b: GenericFile[]) => combineFilesOfSameType([...a, ...b])
      : undefined,
  })
}

async function ensureSource(finderSourceId: string, dbTx: DbTransaction): Promise<dbSchema.Source> {
  let source = await dbTx.query.source.findFirst({
    where: (s, { eq }) => eq(s.finderSourceId, finderSourceId),
  })
  if (!source) {
    source = await dbTx.insert(dbSchema.source)
      .values({ finderSourceId, updatedAt: new Date() })
      .returning()
      .then(r => r[0])
    if (!source) throw new Error('Failed to create source')
  }
  return source
}

function buildCacheMediaValues(finderMedias: GenericMedia[]) {
  const now = new Date()

  const files = finderMedias.flatMap(fm =>
    (fm.files || []).map(file => ({
      createdAt: now,
      updatedAt: now,
      finderSourceId: fm.mediaFinderSource,
      finderMediaId: String(fm.id),
      ...finderFileToCacheFile(file),
    })),
  )

  const sources = finderMedias.map((fm) => {
    const total = (fm.numberOfLikes ?? 0) + (fm.numberOfDislikes ?? 0)
    return {
      createdAt: now,
      updatedAt: now,
      uploadedAt: fm.dateUploaded ? new Date(fm.dateUploaded) : null,
      finderSourceId: fm.mediaFinderSource,
      finderMediaId: String(fm.id),
      title: fm.title ?? null,
      description: fm.description ?? null,
      url: fm.url ?? null,
      creator: fm.usernameOfCreator ?? null,
      uploader: (fm.usernameOfUploader ?? fm.nameOfUploader) ?? null,
      views: fm.views ?? null,
      likes: fm.numberOfLikes ?? null,
      likesPercentage: total > 0 ? ((fm.numberOfLikes ?? 0) / total) * 100 : null,
      dislikes: fm.numberOfDislikes ?? null,
    }
  })

  const uploadDates = finderMedias
    .map(fm => fm.dateUploaded ? new Date(fm.dateUploaded) : null)
    .filter((d): d is Date => d !== null)

  const mainFile = files.find(f => f.type === 'full') ?? files.find(f => f.type === 'main') ?? files[0]

  return {
    title: finderMedias.map(fm => fm.title).find(t => !!t) ?? null,
    description: finderMedias.map(fm => fm.description).find(d => !!d) ?? null,
    earliestUploadedAt: uploadDates.length > 0 ? new Date(Math.min(...uploadDates.map(d => d.getTime()))) : null,
    creators: [...new Set(finderMedias.map(fm => fm.usernameOfCreator).filter((c): c is string => !!c))],
    uploaders: [...new Set(finderMedias.map(fm => fm.usernameOfUploader ?? fm.nameOfUploader).filter((u): u is string => !!u))],
    views: finderMedias.reduce<number | null>((sum, fm) => fm.views != null ? (sum ?? 0) + fm.views : sum, null),
    likes: finderMedias.reduce<number | null>((sum, fm) => fm.numberOfLikes != null ? (sum ?? 0) + fm.numberOfLikes : sum, null),
    dislikes: finderMedias.reduce<number | null>((sum, fm) => fm.numberOfDislikes != null ? (sum ?? 0) + fm.numberOfDislikes : sum, null),
    finderSourceMediaIds: finderMedias.map(fm => [fm.mediaFinderSource, String(fm.id)]),
    hasVideo: mainFile?.hasVideo ?? null,
    hasAudio: mainFile?.hasAudio ?? null,
    hasImage: mainFile?.hasImage ?? null,
    duration: mainFile?.duration ?? null,
    fileSize: mainFile?.fileSize ?? null,
    width: mainFile?.width ?? null,
    height: mainFile?.height ?? null,
    files,
    sources,
    updatedAt: now,
  }
}

export async function createCacheMedia({
  finderMedias,
  dbTx,
}: {
  finderMedias: GenericMedia[]
  dbTx: DbTransaction
}): Promise<dbSchema.CacheMedia> {
  for (const fm of finderMedias) {
    await ensureSource(fm.mediaFinderSource, dbTx)
  }
  const [cacheMedia] = await dbTx.insert(dbSchema.cacheMedia)
    .values(buildCacheMediaValues(finderMedias))
    .returning()
  return cacheMedia
}

export async function updateCacheMedia({
  existingCacheMedia,
  allFinderMedias,
  dbTx,
}: {
  existingCacheMedia: dbSchema.CacheMedia
  allFinderMedias: GenericMedia[]
  dbTx: DbTransaction
}): Promise<void> {
  for (const fm of allFinderMedias) {
    await ensureSource(fm.mediaFinderSource, dbTx)
  }
  await dbTx.update(dbSchema.cacheMedia)
    .set(buildCacheMediaValues(allFinderMedias))
    .where(eq(dbSchema.cacheMedia.id, existingCacheMedia.id))
}

export async function createOrUpdateCacheMediaGroups({
  finderMedias,
  cacheMedia,
  dbTx,
}: {
  finderMedias: GenericMedia[]
  cacheMedia: dbSchema.CacheMedia
  dbTx: DbTransaction
}): Promise<number[][]> {
  let rootTagsGroup = await dbTx.query.group.findFirst({
    where: g => and(eq(g.name, 'tags'), isNull(g.parentId)),
  })
  if (!rootTagsGroup) {
    rootTagsGroup = await dbTx.insert(dbSchema.group)
      .values({ name: 'tags', updatedAt: new Date() })
      .returning()
      .then(r => r[0])
    if (!rootTagsGroup) throw new Error('Failed to create root tags group')
  }

  const allTags = [...new Set(finderMedias.flatMap(fm => fm.tags || []))]

  const groupIds: number[][] = []
  for (const tag of allTags) {
    let group = await dbTx.query.group.findFirst({
      where: g => and(eq(g.name, tag), eq(g.parentId, rootTagsGroup.id)),
    })
    if (!group) {
      group = await dbTx.insert(dbSchema.group)
        .values({ name: tag, parentId: rootTagsGroup.id, updatedAt: new Date() })
        .returning()
        .then(r => r[0])
      if (!group) throw new Error(`Failed to create tag group: ${tag}`)
    }
    groupIds.push([group.id, rootTagsGroup.id])
  }

  await dbTx.update(dbSchema.cacheMedia)
    .set({ groupIds, updatedAt: new Date() })
    .where(eq(dbSchema.cacheMedia.id, cacheMedia.id))

  return groupIds
}

export async function getPreviousFinderQueryExecution({
  queryId,
  currentExecutionId,
}: {
  queryId: number
  currentExecutionId: number
}): Promise<dbSchema.FinderQueryExecution | null> {
  return db.query.finderQueryExecution.findFirst({
    where: (exec, { eq, ne, and }) => and(
      eq(exec.queryId, queryId),
      ne(exec.id, currentExecutionId),
    ),
    orderBy: (exec, { desc }) => [desc(exec.startedAt)],
  }).then(r => r ?? null)
}

type SourceMediaPair = { finderSourceId: string, finderMediaId: string, contentHash: string }

export async function getChangedPairs({
  currentExecutionId,
  previousExecutionId,
}: {
  currentExecutionId: number
  previousExecutionId: number | null
}): Promise<{ added: SourceMediaPair[], updated: SourceMediaPair[], removed: SourceMediaPair[] }> {
  const currentPairs = await db.select({
    finderSourceId: dbSchema.finderQueryMedia.finderSourceId,
    finderMediaId: dbSchema.finderQueryMedia.finderMediaId,
    contentHash: dbSchema.finderQueryMedia.contentHash,
  }).from(dbSchema.finderQueryMedia)
    .where(eq(dbSchema.finderQueryMedia.queryExecutionId, currentExecutionId))

  if (!previousExecutionId) {
    return { added: currentPairs, updated: [], removed: [] }
  }

  const previousPairs = await db.select({
    finderSourceId: dbSchema.finderQueryMedia.finderSourceId,
    finderMediaId: dbSchema.finderQueryMedia.finderMediaId,
    contentHash: dbSchema.finderQueryMedia.contentHash,
  }).from(dbSchema.finderQueryMedia)
    .where(eq(dbSchema.finderQueryMedia.queryExecutionId, previousExecutionId))

  const currentMap = new Map(currentPairs.map(p => [`${p.finderSourceId}:${p.finderMediaId}`, p]))
  const previousMap = new Map(previousPairs.map(p => [`${p.finderSourceId}:${p.finderMediaId}`, p]))

  const added: SourceMediaPair[] = []
  const updated: SourceMediaPair[] = []
  const removed: SourceMediaPair[] = []

  for (const [key, pair] of currentMap) {
    const prev = previousMap.get(key)
    if (!prev) added.push(pair)
    else if (prev.contentHash !== pair.contentHash) updated.push(pair)
  }

  for (const [key, pair] of previousMap) {
    if (!currentMap.has(key)) removed.push(pair)
  }

  return { added, updated, removed }
}

export async function deleteCacheMediaEntry({
  cacheMedia,
  deletionReason,
  mergedIntoCacheMediaId,
  dbTx,
}: {
  cacheMedia: dbSchema.CacheMedia
  deletionReason: string
  mergedIntoCacheMediaId?: number
  dbTx: DbTransaction
}): Promise<void> {
  await dbTx.insert(dbSchema.deletedCacheMedia).values({
    updatedAt: new Date(),
    cacheMediaId: cacheMedia.id,
    deletionReason,
    mergedIntoCacheMediaId: mergedIntoCacheMediaId ?? null,
  })
  await dbTx.delete(dbSchema.cacheMedia).where(eq(dbSchema.cacheMedia.id, cacheMedia.id))
}

export async function deleteOldFinderQueryMedia({
  queryId,
  currentExecutionId,
}: {
  queryId: number
  currentExecutionId: number
}): Promise<void> {
  const oldExecutions = await db
    .select({ id: dbSchema.finderQueryExecution.id })
    .from(dbSchema.finderQueryExecution)
    .where(and(
      eq(dbSchema.finderQueryExecution.queryId, queryId),
      ne(dbSchema.finderQueryExecution.id, currentExecutionId),
    ))

  if (oldExecutions.length === 0) return

  await db.delete(dbSchema.finderQueryMedia)
    .where(inArray(dbSchema.finderQueryMedia.queryExecutionId, oldExecutions.map(r => r.id)))
}

export async function finalizeFinderQueryExecution({
  executionId,
  stats,
}: {
  executionId: number
  stats: { mediaFound: number, mediaNew: number, mediaUpdated: number, mediaRemoved: number }
}): Promise<void> {
  await db.update(dbSchema.finderQueryExecution)
    .set({ ...stats, finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(dbSchema.finderQueryExecution.id, executionId))
}
