import { consola } from 'consola'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export default defineNitroPlugin(async () => {
  if (!process.env.DATABASE_URL) {
    throw Error('Env var DATABASE_URL is not set')
  }
  const dbClient = postgres(process.env.DATABASE_URL, { max: 1 })
  const dbDrizzle = drizzle(dbClient)
  await migrate(dbDrizzle, { migrationsFolder: 'server/database/migrations' })
    .then(() => {
      consola.success('Database migrations done')
    })
    .catch((err) => {
      consola.error('Database migrations failed', err)
    })
})
