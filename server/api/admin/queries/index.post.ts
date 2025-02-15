import { serialize } from '~/server/lib/general'

export default defineEventHandler(async (event) => {
  const { requestOptions, ...other } = await readBody(event)

  const mediaFinderQuery = await db.insert(dbSchema.finderQuery).values({
    ...other,
    requestOptions: serialize(requestOptions),
    updatedAt: new Date(),
  })
  return mediaFinderQuery
})
