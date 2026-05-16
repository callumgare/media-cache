import util from "node:util";
import { notInArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push(
        "Deleting orphaned liaseQueryMediaContent records",
      );

      const referencedHashes = db
        .select({ contentHash: dbSchema.liaseQueryMedia.contentHash })
        .from(dbSchema.liaseQueryMedia);

      const deleted = await db
        .delete(dbSchema.liaseQueryMediaContent)
        .where(
          notInArray(
            dbSchema.liaseQueryMediaContent.contentHash,
            referencedHashes,
          ),
        )
        .returning({
          contentHash: dbSchema.liaseQueryMediaContent.contentHash,
        });

      await eventStream.push(`Done. Deleted ${deleted.length} records.`);
      await eventStream.flush();
      await eventStream.close();
    } catch (error) {
      console.error(error);
      await eventStream.push(util.inspect(error, { depth: 4 }));
      await eventStream.flush();
      await eventStream.close();
    }
  })();

  return eventStream.send();
});
