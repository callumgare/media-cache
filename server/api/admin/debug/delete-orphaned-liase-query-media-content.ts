import util from "node:util";
import { inArray, notInArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push(
        "Finding orphaned liaseQueryMediaContent records...",
      );

      const referencedHashes = db
        .select({ contentHash: dbSchema.liaseQueryMedia.contentHash })
        .from(dbSchema.liaseQueryMedia);

      const orphaned = await db
        .select({ contentHash: dbSchema.liaseQueryMediaContent.contentHash })
        .from(dbSchema.liaseQueryMediaContent)
        .where(
          notInArray(
            dbSchema.liaseQueryMediaContent.contentHash,
            referencedHashes,
          ),
        );

      const batchSize = 50;
      await eventStream.push(
        `Found ${orphaned.length} orphaned records. Deleting in groups of ${batchSize}...`,
      );

      let totalDeleted = 0;

      for (let i = 0; i < orphaned.length; i += batchSize) {
        const batch = orphaned
          .slice(i, i + batchSize)
          .map((r) => r.contentHash);
        const deleted = await db
          .delete(dbSchema.liaseQueryMediaContent)
          .where(inArray(dbSchema.liaseQueryMediaContent.contentHash, batch))
          .returning({
            contentHash: dbSchema.liaseQueryMediaContent.contentHash,
          });
        totalDeleted += deleted.length;
        await eventStream.push(
          `Deleted ${totalDeleted} / ${orphaned.length} records...`,
        );
      }

      await eventStream.push(`Done. Deleted ${totalDeleted} records in total.`);
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
