import { z } from 'zod'

import { count, eq, type SQL, sql } from 'drizzle-orm'
import type { APIMediaResponse, APIMedia } from '../../types/api-media'
import type { QueryGroupCondition, QueryCondition } from '~/types/query-condition'

const returnedNumber = 10

export default defineEventHandler(async (event): Promise<z.infer<typeof APIMediaResponse>> => {
  const query = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().int(),
    }).parse,
  )
  const body: QueryGroupCondition = await readBody(event)

  const pageNumber = query.page

  const totalCount = await db.select({ count: count() }).from(dbSchema.cacheMedia).then(res => res[0].count)

  const seed = Math.floor(Math.sin(
    (new Date().getFullYear() * 10000) + (new Date().getMonth() * 100) + new Date().getDate(),
  ) * 10000000)

  function calculateWhereValue(condition: QueryCondition): SQL | null {
    if (condition.type === 'group') {
      const childConditions = condition.conditions.filter(condition => !('value' in condition) || condition.value !== '')
      if (!childConditions.length) {
        return null
      }
      let sqlOperator: SQL
      if (condition.operator === 'AND') {
        sqlOperator = sql`AND`
      }
      else if (condition.operator === 'OR') {
        sqlOperator = sql`OR`
      }
      else {
        throw Error(`Unknown operator: ${condition.operator}`)
      }
      const sqlChildConditions = childConditions.map(calculateWhereValue).filter(sql => sql !== null)
      return sql`( ${sql.join(sqlChildConditions, sqlOperator)} )`
    }
    else {
      let sqlField
      if (condition.field === 'source') {
        sqlField = dbSchema.cacheMediaSource.finderSourceId
      }
      else {
        throw Error(`Unknown field: ${condition.field}`)
      }
      let sqlOperator: SQL
      if (condition.operator === 'equals') {
        sqlOperator = sql`=`
      }
      else {
        throw Error(`Unknown operator: ${condition.operator}`)
      }
      return sql`${sqlField} ${sqlOperator} ${condition.value}`
    }
  }

  const resultIds = await db.select({
    mediaId: sql`max(${dbSchema.cacheMedia.id})`.as('media_id'),
    hash: sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`.as('hash'),
  })
    .from(dbSchema.cacheMedia)
    .leftJoin(dbSchema.cacheMediaFile, eq(dbSchema.cacheMediaFile.mediaId, dbSchema.cacheMedia.id))
    .leftJoin(dbSchema.cacheMediaSource, eq(dbSchema.cacheMediaSource.cacheMediaId, dbSchema.cacheMedia.id))
    .where(calculateWhereValue(body) ?? undefined)
    .offset((pageNumber - 1) * returnedNumber)
    .orderBy(sql`"hash"`)
    .groupBy(sql`"hash"`)
    .limit(returnedNumber)

  let dbMedias
  if (resultIds.length) {
    dbMedias = await db.query.cacheMedia.findMany({
      with: {
        files: true,
        sourceSpecificInfo: {
          with: {
            source: true,
          },
        },
      },
      where: sql`${dbSchema.cacheMedia.id} in (${sql.join(resultIds.map(res => sql`${res.mediaId}`), sql`,`)})`,
      orderBy: sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`,
    })
  }

  const apiMedias = dbMedias?.map(
    media => ({
      id: media.id,
      title: media.title,
      description: media.description,
      sourceDetails: media.sourceSpecificInfo.map(
        sourceDetails => ({
          id: sourceDetails.id,
          sourceName: sourceDetails.finderSourceId,
          title: sourceDetails.title,
          url: sourceDetails.url,
          creator: sourceDetails.creator,
          views: sourceDetails.views,
          likes: sourceDetails.likes,
          likesPercentage: sourceDetails.likesPercentage,
        }),
      ),
      files: media.files.map(
        (file) => {
          const fileUrl = new URL(file.url)
          const filename = fileUrl.pathname.match(/\/([^/]*)$/)?.[1]
          return {
            id: file.id,
            type: file.type,
            hasVideo: file.hasVideo,
            hasAudio: file.hasAudio,
            hasImage: file.hasImage,
            fileSize: file.fileSize,
            width: file.width,
            height: file.height,
            ext: file.ext,
            url: filename ? filename + fileUrl.search : '',
          }
        },
      ),
    } satisfies z.infer<typeof APIMedia>),
  ) ?? []

  return {
    totalCount,
    pageSize: returnedNumber,
    media: apiMedias,
    date: new Date(),
  }
})
