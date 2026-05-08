import type { QueryDetailResponse } from "@@/types/api-queries";
import { createError } from "h3";

export default defineEventHandler(
  async (event): Promise<QueryDetailResponse> => {
    const idParam = getRouterParam(event, "id");
    const id = Number.parseInt(idParam || "", 10);
    if (Number.isNaN(id)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid query ID" });
    }
    const mediaFinderQuery = await db.query.finderQuery.findFirst({
      where: (finderQuery, { eq }) => eq(finderQuery.id, id),
    });
    if (!mediaFinderQuery) {
      throw createError({
        statusCode: 404,
        statusMessage: `Query with ID ${id} not found`,
      });
    }
    return mediaFinderQuery;
  },
);
