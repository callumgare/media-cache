import { eq } from 'drizzle-orm'
import { serialize } from '~/lib/general'

export default defineEventHandler(async (event) => {
  const { requestOptions, createdAt, updatedAt, ...other } = await readBody(event)

  const mediaFinderQuery = await db.update(schema.MediaFinderQuery)
    .set({
      ...other,
      requestOptions: serialize(requestOptions),
      updatedAt: new Date(),
    })
    .where(eq(schema.MediaFinderQuery.id, other.id))
    .returning({ id: schema.MediaFinderQuery.id })
  return mediaFinderQuery
})
