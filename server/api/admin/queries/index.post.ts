import { parseMediaFinderRequest } from "@@/server/lib/media-finder/parse-request";

export default defineEventHandler(async (event) => {
  const { requestOptions, ...other } = await readBody(event);

  const [mediaFinderQuery] = await db
    .insert(dbSchema.finderQuery)
    .values({
      ...other,
      requestOptions: await parseMediaFinderRequest(requestOptions),
      updatedAt: new Date(),
    })
    .returning();
  return mediaFinderQuery;
});
