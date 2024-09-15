import { deserialize } from '~/lib/general'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = parseInt(idParam || '')
  if (isNaN(id)) {
    throw Error('Invalid id')
  }
  const mediaFinderQuery = await db.query.finderQuery.findFirst({
    where: (finderQuery, { eq }) => (eq(finderQuery.id, id)),
  })
  if (!mediaFinderQuery) {
    throw Error(`Could not get query for "${idParam}" id`)
  }
  return {
    ...mediaFinderQuery,
    requestOptions: deserialize(mediaFinderQuery?.requestOptions),
  }
})
