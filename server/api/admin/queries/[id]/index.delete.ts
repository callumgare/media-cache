import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = parseInt(idParam || '')
  if (isNaN(id)) {
    throw Error('Invalid id')
  }
  const mediaFinderQuery = await db.delete(dbSchema.finderQuery)
    .where(eq(dbSchema.finderQuery.id, id))
  if (!mediaFinderQuery) {
    throw Error(`Could not find query with id "${idParam}" to delete`)
  }
  return mediaFinderQuery
})
