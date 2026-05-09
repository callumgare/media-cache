import util from "node:util";
import { count, inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push("Deleting finderQueryMedia");
      await db.delete(dbSchema.finderQueryMedia);
      eventStream.push("Deleting finderQueryMediaContent");
      await db.delete(dbSchema.finderQueryMediaContent);
      await eventStream.push("Deleting finderQueryExecutionLog");
      await db.delete(dbSchema.finderQueryExecutionLog);
      await eventStream.push("Deleting finderQueryExecution");
      await db.delete(dbSchema.finderQueryExecution);
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
