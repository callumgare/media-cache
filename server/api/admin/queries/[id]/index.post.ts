import { parseMediaFinderRequest } from "@@/server/lib/media-finder/parse-request";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { requestOptions, queryVariations, createdAt, updatedAt, ...other } =
    await readBody(event);

  const mediaFinderQuery = await db
    .update(dbSchema.finderQuery)
    .set({
      ...other,
      requestOptions: await parseMediaFinderRequest(requestOptions),
      queryVariations: queryVariations ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dbSchema.finderQuery.id, other.id))
    .returning({ id: dbSchema.finderQuery.id });
  return mediaFinderQuery;
});
