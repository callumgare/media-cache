import util from "node:util";
import { and, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  (async () => {
    try {
      let totalDeleted = 0;
      let round = 0;

      const childGroup = alias(dbSchema.group, "child_group");

      // Iteratively delete empty groups — each pass may expose new empty parents
      while (true) {
        round++;
        const deleted = await db
          .delete(dbSchema.group)
          .where(
            and(
              notExists(
                db
                  .select({ id: childGroup.id })
                  .from(childGroup)
                  .where(eq(childGroup.parentId, dbSchema.group.id)),
              ),
              notExists(
                db
                  .select({ id: dbSchema.cacheMedia.id })
                  .from(dbSchema.cacheMedia)
                  .where(
                    sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${dbSchema.group.id}::text]`,
                  ),
              ),
            ),
          )
          .returning({ id: dbSchema.group.id });

        if (deleted.length === 0) break;
        totalDeleted += deleted.length;
        await eventStream.push(
          `Round ${round}: deleted ${deleted.length} empty group(s)`,
        );
      }

      await eventStream.push(
        `Done. Deleted ${totalDeleted} empty group(s) total.`,
      );
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
