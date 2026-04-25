import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${dbName}`
  return parsed.toString()
}

export async function setup() {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) throw new Error('DATABASE_URL is not set')

  const adminClient = postgres(withDatabase(baseUrl, 'postgres'), { max: 1 })
  try {
    await adminClient`CREATE DATABASE media_cache_test`
  }
  catch (e: unknown) {
    if (!(e instanceof Error) || !e.message?.includes('already exists')) throw e
  }
  finally {
    await adminClient.end()
  }

  const migrateClient = postgres(withDatabase(baseUrl, 'media_cache_test'), { max: 1 })
  try {
    const db = drizzle(migrateClient)
    await migrate(db, { migrationsFolder: './server/database/migrations' })
  }
  finally {
    await migrateClient.end()
  }
}
