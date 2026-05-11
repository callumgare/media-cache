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
  // finderQueryExecution has a FK to finderQuery with no ON DELETE CASCADE,
  // so we must remove child rows before deleting the parent query.
  const executions = await db
    .select({ id: dbSchema.finderQueryExecution.id })
    .from(dbSchema.finderQueryExecution)
    .where(eq(dbSchema.finderQueryExecution.queryId, id));

  if (executions.length > 0) {
    const executionIds = executions.map((e) => e.id);

    // 1. Remove execution log entries (FK → finderQueryExecution.id)
    await db
      .delete(dbSchema.finderQueryExecutionLog)
      .where(
        inArray(dbSchema.finderQueryExecutionLog.executionId, executionIds),
      );

    // 2. Remove finder query media linked via execution (FK → finderQueryExecution.id)
    await db
      .delete(dbSchema.finderQueryMedia)
      .where(inArray(dbSchema.finderQueryMedia.queryExecutionId, executionIds));

    // 3. Remove executions (FK → finderQuery.id)
    await db
      .delete(dbSchema.finderQueryExecution)
      .where(eq(dbSchema.finderQueryExecution.queryId, id));
  }

  // 4. Remove any finder query media linked directly to this query (FK → finderQuery.id)
  await db
    .delete(dbSchema.finderQueryMedia)
    .where(eq(dbSchema.finderQueryMedia.queryId, id));

  // 5. Delete the query itself
  const result = await db
    .delete(dbSchema.finderQuery)
    .where(eq(dbSchema.finderQuery.id, id));
  return result;
});
