import { startLiaseQueryExecution } from "@@/server/lib/liase/run-query";
import { db } from "@@/server/utils/drizzle";
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  const id = Number.parseInt(idParam || "", 10);
  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid query ID" });
  }
  const liaseQuery = await db.query.liaseQuery.findFirst({
    where: (liaseQuery, { eq }) => eq(liaseQuery.id, id),
  });
  if (!liaseQuery) {
    throw createError({
      statusCode: 404,
      statusMessage: `Query with ID ${id} not found`,
    });
  }

  let body: { fetchCountLimitOverride?: number | null } | null = null;
  try {
    body = await readBody(event);
  } catch {
    body = null;
  }

  const queryToRun =
    body != null && "fetchCountLimitOverride" in body
      ? { ...liaseQuery, fetchCountLimit: body.fetchCountLimitOverride ?? null }
      : liaseQuery;

  const { execution, executionPromise } =
    await startLiaseQueryExecution(queryToRun);
  executionPromise.catch((err) => {
    console.error(`Query execution ${execution.id} failed:`, err);
  });
  return execution;
});
