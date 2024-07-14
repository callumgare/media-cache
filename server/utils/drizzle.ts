import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../database/schema'

if (!process.env.DATABASE_URL) {
  throw Error('Env var DATABASE_URL is not set')
}

const queryClient = postgres(process.env.DATABASE_URL)
const db = drizzle(queryClient, { schema })

export { db, schema }

export type DBUser = typeof schema.User.$inferSelect
export type DBMedia = typeof schema.Media.$inferSelect
export type DBSourceMediaDetails = typeof schema.SourceMediaDetails.$inferSelect
export type DBFile = typeof schema.File.$inferSelect
export type DBSource = typeof schema.Source.$inferSelect
export type DBGroup = typeof schema.Group.$inferSelect
export type DBGroupEntry = typeof schema.GroupEntry.$inferSelect
export type DBMediaFinderSettings = typeof schema.MediaFinderSettings.$inferSelect
export type DBMediaFinderQuery = typeof schema.MediaFinderQuery.$inferSelect
export type DBMediaFinderHistory = typeof schema.MediaFinderHistory.$inferSelect
export type DBMediaFinderResponseItemMap = typeof schema.MediaFinderResponseItemMap.$inferSelect
export type DBMediaFinderResponseItemContent = typeof schema.MediaFinderResponseItemContent.$inferSelect
export type DBMergedMediaIndex = typeof schema.MergedMediaIndex.$inferSelect
