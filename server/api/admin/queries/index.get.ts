import { asc } from "drizzle-orm";

import type { QueryListResponse } from "@@/types/api-queries";

export default defineEventHandler(async (): Promise<QueryListResponse> => {
  return db.query.finderQuery.findMany({
    orderBy: [asc(dbSchema.finderQuery.createdAt)],
  });
});
