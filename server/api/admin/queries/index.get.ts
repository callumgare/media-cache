import { deserialize } from '~/lib/general'
import prisma from '~/lib/prisma'

export default defineEventHandler(async () => {
  const mediaFinderQueries = await prisma.mediaFinderQuery.findMany()
  for (const mediaFinderQuery of mediaFinderQueries) {
    mediaFinderQuery.requestOptions = deserialize(mediaFinderQuery.requestOptions)
  }
  return mediaFinderQueries
})
