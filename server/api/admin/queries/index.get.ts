import { deserialize } from '~/lib/general'

export default defineEventHandler(async () => {
  const mediaFinderQueries = await db.query.MediaFinderQuery.findMany()
  for (const mediaFinderQuery of mediaFinderQueries) {
    mediaFinderQuery.requestOptions = deserialize(mediaFinderQuery.requestOptions)
  }
  return mediaFinderQueries
})
