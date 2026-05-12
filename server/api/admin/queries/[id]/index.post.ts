import { parseLiaseRequest } from "@@/server/lib/liase/parse-request";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { requestOptions, queryVariations, createdAt, updatedAt, ...other } =
    await readBody(event);

  const liaseQuery = await db
    .update(dbSchema.liaseQuery)
    .set({
      ...other,
      requestOptions: await parseLiaseRequest(requestOptions),
      queryVariations: queryVariations ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dbSchema.liaseQuery.id, other.id))
    .returning({ id: dbSchema.liaseQuery.id });
  return liaseQuery;
});
