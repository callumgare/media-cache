import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

import type { APIMediaResponse, APIMedia } from '../../types/api-media'

const prisma = new PrismaClient()

const returnedNumber = 10

export default defineEventHandler(async (event): Promise<z.infer<typeof APIMediaResponse>> => {
  const query = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().int(),
    }).parse,
  )

  const pageNumber = query.page

  const totalCount = await prisma.media.count({})

  const medias = await prisma.media.findMany({
    include: {
      files: true,
      sourceDetails: {
        include: {
          source: true,
        },
      },
    },
    take: returnedNumber,
    skip: (pageNumber - 1) * returnedNumber,
  }).then(medias => medias.map(
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
  ))

  return {
    totalCount,
    pageSize: returnedNumber,
    media: medias,
    date: new Date(),
  }
})
