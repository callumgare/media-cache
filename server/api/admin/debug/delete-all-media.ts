import util from "node:util";
import { count, inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push("Deleting cacheMedia");
      await db.delete(dbSchema.cacheMedia);
      await eventStream.push("Deleting liaseQueryMedia");
      await db.delete(dbSchema.liaseQueryMedia);
      await eventStream.push("Deleting group");
      await db.delete(dbSchema.group);
      await eventStream.push("Deleting source");
      await db.delete(dbSchema.source);
      await eventStream.push("Deleting deletedCacheMedia");
      await db.delete(dbSchema.deletedCacheMedia);
      await eventStream.push("done");
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
