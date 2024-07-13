import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = parseInt(idParam || '')
  if (isNaN(id)) {
    throw Error('Invalid id')
  }
  const mediaFinderQuery = await prisma.mediaFinderQuery.delete({
    where: { id },
  })
  if (!mediaFinderQuery) {
    throw Error(`Could not find query with id "${idParam}" to delete`)
  }
  return mediaFinderQuery
})
