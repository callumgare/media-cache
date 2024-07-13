import prisma from '~/lib/prisma'
import { runMediaFinderQuery } from '@/server/lib/media-finder/run-query'
import { deserialize } from '~/lib/general'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = parseInt(idParam || '')
  if (isNaN(id)) {
    throw Error('Invalid id')
  }
  const mediaFinderQuery = await prisma.mediaFinderQuery.findUnique({
    where: { id },
  })
  if (!mediaFinderQuery) {
    throw Error(`Could not get query for "${idParam}" id`)
  }
  mediaFinderQuery.requestOptions = deserialize(mediaFinderQuery.requestOptions)
  runMediaFinderQuery(mediaFinderQuery)
  return {}
})
