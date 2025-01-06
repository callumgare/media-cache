import { count, sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  ;(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('Deleting cacheMediaGroup')
    await db.delete(dbSchema.cacheMediaGroup)
    console.log('Deleting cacheMediaFile')
    await db.delete(dbSchema.cacheMediaFile)
    console.log('Deleting cacheMediaSource')
    await db.delete(dbSchema.cacheMediaSource)
    console.log('Deleting cacheMediaUser')
    await db.delete(dbSchema.cacheMediaUser)
    console.log('Deleting cacheMedia')
    await db.delete(dbSchema.cacheMedia)
    console.log('Deleting finderQueryExecutionMedia')
    await db.delete(dbSchema.finderQueryExecutionMedia)
    console.log('Deleting finderQueryExecutionMediaContent')
    let isRowsRemaining = true
    while (isRowsRemaining) {
      await db.delete(dbSchema.finderQueryExecutionMediaContent).where(sql`content_hash IN (
        select content_hash from ${dbSchema.finderQueryExecutionMediaContent} LIMIT 500
      )`)
      const rowsRemaining = await db.select({ count: count() }).from(dbSchema.finderQueryExecutionMediaContent).then(res => res[0].count)
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
