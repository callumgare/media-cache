import { z } from 'zod'
import { sql, count, inArray } from 'drizzle-orm'
import type { APIMediaResponse, APIMedia } from '../../types/api-media'
import { calculateWhereValue } from '../utils/query-builder'
import type { QueryGroupCondition } from '@@/types/query-condition'

const returnedNumber = 10

export default defineEventHandler(async (event): Promise<z.infer<typeof APIMediaResponse>> => {
  const query = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().int(),
      seed: z.coerce.number().int(),
    }).parse,
  )
  const body: QueryGroupCondition = await readBody(event)

  const pageNumber = query.page

  const seed = Math.floor(Math.sin(
    (query.seed * 10000) + (new Date().getMonth() * 100) + new Date().getDate(),
  ) * 10000000)

  const whereClause = calculateWhereValue(body)

  const totalCount = await db.select({ count: count() }).from(dbSchema.cacheMedia).where(whereClause).then(res => res[0]?.count ?? 0)

  const resultIds = await db.select({
    mediaId: dbSchema.cacheMedia.id,
    hash: sql<number>`hashint4(${dbSchema.cacheMedia.id} + ${seed})`.as('hash'),
  })
    .from(dbSchema.cacheMedia)
    .where(whereClause)
    .offset((pageNumber - 1) * returnedNumber)
    .orderBy(sql`"hash"`)
    .limit(returnedNumber)

  let dbMedias: (typeof dbSchema.cacheMedia.$inferSelect)[] = []
  if (resultIds.length) {
    dbMedias = await db.select()
      .from(dbSchema.cacheMedia)
      .where(inArray(dbSchema.cacheMedia.id, resultIds.map(res => res.mediaId)))
      .orderBy(sql`hashint4(${dbSchema.cacheMedia.id} + ${seed})`)
  }

  const apiMedias = dbMedias.map(
    media => ({
      id: media.id,
      title: media.title,
      description: media.description,
      sourceDetails: (media.sources ?? []).map(src => ({
        sourceName: src.finderSourceId,
        title: src.title,
        url: src.url,
        creator: src.creator,
        views: src.views,
        likes: src.likes,
        likesPercentage: src.likesPercentage,
      })),
      files: (media.files ?? []).map((file) => {
        return {
          type: file.type,
          hasVideo: file.hasVideo,
          hasAudio: file.hasAudio,
          hasImage: file.hasImage,
          fileSize: file.fileSize,
          width: file.width,
          height: file.height,
          ext: file.ext,
          filename: `media-${media.id}-${file.type}.${file.ext}`,
          sourceUrl: file.url,
        }
      }),
    } satisfies z.infer<typeof APIMedia>),
  )

  return {
    totalCount,
    pageSize: returnedNumber,
    media: apiMedias,
    page: pageNumber,
    date: new Date(),
  }
})
