import { eq } from 'drizzle-orm'
import { serialize } from '~/server/lib/general'

export default defineEventHandler(async (event) => {
  const { requestOptions, createdAt, updatedAt, ...other } = await readBody(event)

  const mediaFinderQuery = await db.update(dbSchema.finderQuery)
    .set({
      ...other,
      requestOptions: serialize(requestOptions),
      updatedAt: new Date(),
    })
    .where(eq(dbSchema.finderQuery.id, other.id))
    .returning({ id: dbSchema.finderQuery.id })
  return mediaFinderQuery
})
