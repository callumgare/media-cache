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

  const totalCount = await db.select({ count: count() }).from(schema.Media).then(res => res[0].count)

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
        sqlField = schema.SourceMediaDetails.finderSourceId
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
    mediaId: sql`max(${schema.Media.id})`.as('media_id'),
    hash: sql`hashint4(${schema.Media.id} + ${seed})`.as('hash'),
  })
    .from(schema.Media)
    .leftJoin(schema.File, eq(schema.File.mediaId, schema.Media.id))
    .leftJoin(schema.SourceMediaDetails, eq(schema.SourceMediaDetails.mediaId, schema.Media.id))
    .where(calculateWhereValue(body) ?? undefined)
    .offset((pageNumber - 1) * returnedNumber)
    .orderBy(sql`"hash"`)
    .groupBy(sql`"hash"`)
    .limit(returnedNumber)

  const dbMedias = await db.query.Media.findMany({
    with: {
      files: true,
      sourceDetails: {
        with: {
          source: true,
        },
      },
    },
    where: sql`${schema.Media.id} in (${sql.join(resultIds.map(res => sql`${res.mediaId}`), sql`,`)})`,
    orderBy: sql`hashint4(${schema.Media.id} + ${seed})`,
  })

  const apiMedias = dbMedias.map(
    media => ({
      id: media.id,
      title: media.title,
      description: media.description,
      sourceDetails: media.sourceDetails.map(
        sourceDetails => ({
          id: sourceDetails.id,
          sourceName: sourceDetails.source.finderSourceId,
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
  )

  return {
    totalCount,
    pageSize: returnedNumber,
    media: apiMedias,
    date: new Date(),
  }
})
