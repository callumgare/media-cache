import util from "node:util";
import { count, inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push("Deleting liaseQueryMedia");
      await db.delete(dbSchema.liaseQueryMedia);
      eventStream.push("Deleting liaseQueryMediaContent");
      await db.delete(dbSchema.liaseQueryMediaContent);
      await eventStream.push("Deleting liaseQueryExecutionLog");
      await db.delete(dbSchema.liaseQueryExecutionLog);
      await eventStream.push("Deleting liaseQueryExecution");
      await db.delete(dbSchema.liaseQueryExecution);
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
