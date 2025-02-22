import { asc } from 'drizzle-orm'
import type { MediaFinderQuery } from 'media-finder'

import { deserialize } from '~/server/lib/general'

type MediaFinderQueryOptions = ConstructorParameters<typeof MediaFinderQuery>[0]

export default defineEventHandler(async () => {
  const mediaFinderQueries = await db.query.finderQuery.findMany({
    orderBy: [asc(dbSchema.finderQuery.createdAt)],
  })
  for (const mediaFinderQuery of mediaFinderQueries) {
    mediaFinderQuery.requestOptions = deserialize(mediaFinderQuery.requestOptions) as MediaFinderQueryOptions
  }
  return mediaFinderQueries
})
