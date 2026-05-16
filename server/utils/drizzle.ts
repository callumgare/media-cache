import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as dbSchema from "../database/schema";

if (!process.env.DATABASE_URL) {
  throw Error("Env var DATABASE_URL is not set");
}

// paradedb.check_topk_scan warns when ORDER BY cannot be pushed into the BM25 index.
// The media query intentionally uses hashint4(id + seed) for randomisation, which is
// not indexable, so the warning is expected and should be suppressed.
const queryClient = postgres(process.env.DATABASE_URL, {
  connection: { "paradedb.check_topk_scan": "false" },
});
const db = drizzle(queryClient, {
  schema: dbSchema,
  logger: Boolean(process.env.QUERY_LOGGING),
});

// Separate client for migrations (used by nuxt-drizzle-migrations via useDrizzle()).
// NOTICE messages from migration SQL are suppressed here; they are noisy and expected.
const migrationClient = postgres(process.env.DATABASE_URL, {
  onnotice: (notice) => {
    if (notice.severity !== "NOTICE") console.warn(notice);
  },
});
const migrationDb = drizzle(migrationClient);

export function useDrizzle() {
  return migrationDb;
}

export { db, dbSchema };
