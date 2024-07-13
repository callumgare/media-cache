import prisma from '~/lib/prisma'
import { serialize } from '~/lib/general'

export default defineEventHandler(async (event) => {
  const { requestOptions, ...other } = await readBody(event)

  const mediaFinderQuery = await prisma.mediaFinderQuery.update({
    where: { id: other.id },
    data: {
      ...other,
      requestOptions: serialize(requestOptions),
    },
  })
  return mediaFinderQuery
})
