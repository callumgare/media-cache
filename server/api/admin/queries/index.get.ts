import { asc } from "drizzle-orm";

import type { QueryListResponse } from "@@/types/api-queries";

export default defineEventHandler(async (): Promise<QueryListResponse> => {
  return db.query.liaseQuery.findMany({
    orderBy: [asc(dbSchema.liaseQuery.createdAt)],
  });
});
