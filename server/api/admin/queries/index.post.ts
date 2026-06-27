import { parseLiaseRequest } from "@@/server/lib/liase/parse-request";

export default defineEventHandler(async (event) => {
  const { requestOptions, queryVariations, ...other } = await readBody(event);

  const [liaseQuery] = await db
    .insert(dbSchema.liaseQuery)
    .values({
      ...other,
      requestOptions: await parseLiaseRequest(requestOptions, {
        queryVariations,
      }),
      queryVariations: queryVariations ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return liaseQuery;
});
