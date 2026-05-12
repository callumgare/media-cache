import { startLiaseQueryExecution } from "@@/server/lib/liase/run-query";
import { createError } from "h3";

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
  const { execution } = await startLiaseQueryExecution(liaseQuery);
  return execution;
});
