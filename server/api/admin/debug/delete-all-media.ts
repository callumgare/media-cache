import { count, sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  ;(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('Deleting cacheMedia')
    await db.delete(dbSchema.cacheMedia)
    console.log('Deleting finderQueryMedia')
    await db.delete(dbSchema.finderQueryMedia)
    console.log('Deleting finderQueryMediaContent')
    let isRowsRemaining = true
    while (isRowsRemaining) {
      await db.delete(dbSchema.finderQueryMediaContent).where(sql`content_hash IN (
        select content_hash from ${dbSchema.finderQueryMediaContent} LIMIT 500
      )`)
      const rowsRemaining = await db.select({ count: count() }).from(dbSchema.finderQueryMediaContent).then(res => res[0]?.count ?? 0)
      console.log(`  Rows remaining: ${rowsRemaining}`)
      isRowsRemaining = Boolean(rowsRemaining)
    }
    console.log('Deleting group')
    await db.delete(dbSchema.group)
    console.log('Deleting source')
    await db.delete(dbSchema.source)
    console.log('done')
  })()
  return true
})
