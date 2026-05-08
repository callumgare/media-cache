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

export function useDrizzle() {
  return db;
}

export { db, dbSchema };
