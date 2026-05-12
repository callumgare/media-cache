import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq, inArray } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam } from "h3";

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  const id = Number.parseInt(idParam || "", 10);
  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid query ID" });
  }

  // Fetch execution IDs so we can cascade-delete their dependents.
  // liaseQueryExecution has a FK to liaseQuery with no ON DELETE CASCADE,
  // so we must remove child rows before deleting the parent query.
  const executions = await db
    .select({ id: dbSchema.liaseQueryExecution.id })
    .from(dbSchema.liaseQueryExecution)
    .where(eq(dbSchema.liaseQueryExecution.queryId, id));

  if (executions.length > 0) {
    const executionIds = executions.map((e) => e.id);

    // 1. Remove execution log entries (FK → liaseQueryExecution.id)
    await db
      .delete(dbSchema.liaseQueryExecutionLog)
      .where(
        inArray(dbSchema.liaseQueryExecutionLog.executionId, executionIds),
      );

    // 2. Remove liase query media linked via execution (FK → liaseQueryExecution.id)
    await db
      .delete(dbSchema.liaseQueryMedia)
      .where(inArray(dbSchema.liaseQueryMedia.queryExecutionId, executionIds));

    // 3. Remove executions (FK → liaseQuery.id)
    await db
      .delete(dbSchema.liaseQueryExecution)
      .where(eq(dbSchema.liaseQueryExecution.queryId, id));
  }

  // 4. Remove any liase query media linked directly to this query (FK → liaseQuery.id)
  await db
    .delete(dbSchema.liaseQueryMedia)
    .where(eq(dbSchema.liaseQueryMedia.queryId, id));

  // 5. Delete the query itself
  const result = await db
    .delete(dbSchema.liaseQuery)
    .where(eq(dbSchema.liaseQuery.id, id));
  return result;
});
