import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as dbSchema from '../database/schema'

if (!process.env.DATABASE_URL) {
  throw Error('Env var DATABASE_URL is not set')
}

const queryClient = postgres(process.env.DATABASE_URL)
const db = drizzle(queryClient, { schema: dbSchema, logger: true })

export { db, dbSchema }
