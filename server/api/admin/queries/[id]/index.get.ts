import { deserialize } from '~/lib/general'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = parseInt(idParam || '')
  if (isNaN(id)) {
    throw Error('Invalid id')
  }
  const mediaFinderQuery = await db.query.MediaFinderQuery.findFirst({
    where: (MediaFinderQuery, { eq }) => (eq(MediaFinderQuery.id, id)),
  })
  if (!mediaFinderQuery) {
    throw Error(`Could not get query for "${idParam}" id`)
  }
  return {
    ...mediaFinderQuery,
    requestOptions: deserialize(mediaFinderQuery?.requestOptions),
  }
})
