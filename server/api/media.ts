import { z } from 'zod'

import { count } from 'drizzle-orm'
import type { APIMediaResponse, APIMedia } from '../../types/api-media'

const returnedNumber = 10

export default defineEventHandler(async (event): Promise<z.infer<typeof APIMediaResponse>> => {
  const query = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().int(),
    }).parse,
  )

  const pageNumber = query.page

  const totalCount = await db.select({ count: count() }).from(schema.Media).then(res => res[0].count)

  const date = new Date()
  const seed = (date.getFullYear() * 10000) + (date.getMonth() * 100) + date.getDate()

  const dbMedias = await db.query.Media.findMany({
    with: {
      files: true,
      sourceDetails: {
        with: {
          source: true,
        },
      },
    },
    limit: returnedNumber,
    offset: (pageNumber - 1) * returnedNumber,
    orderBy: (Media, { sql }) => [sql`hashint4(${Media.id} + ${seed})`],
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
