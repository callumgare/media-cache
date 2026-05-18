import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import {
  buildLiaseQueryOptions,
  expandAllVariations,
  runLiaseQueryExecution,
} from "@@/server/lib/liase/run-query";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq } from "drizzle-orm";

/**
 * On startup, find any executions that were still running when the server last
 * exited and attempt to resume them from their last checkpoint. Executions that
 * cannot be resumed (anonymous queries, deleted queries) are marked as failed.
 */
export default defineNitroPlugin(async () => {
  // Wait for the task system's startup scan to identify running execution IDs.
  await queryExecutionTaskSystem.awaitStartupRecovery();

  const runningIds = queryExecutionTaskSystem.getRunningExecutionIds();
  if (runningIds.length === 0) return;

  console.log(
    `[resume] ${runningIds.length} execution(s) were interrupted – attempting to resume...`,
  );

  for (const executionId of runningIds) {
    try {
      const execution = await db.query.liaseQueryExecution.findFirst({
        where: eq(dbSchema.liaseQueryExecution.id, executionId),
      });

      if (!execution) {
        console.error(
          `[resume] Interrupted execution ${executionId} not found in DB – skipping`,
        );
        continue;
      }

      if (!execution.queryId) {
        // Anonymous executions have no saved query and cannot be resumed.
        await db
          .update(dbSchema.liaseQueryExecution)
          .set({
            status: "failed",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dbSchema.liaseQueryExecution.id, executionId));
        await db.insert(dbSchema.liaseQueryExecutionLog).values({
          executionId,
          level: "fatal-error",
          message:
            "Execution was interrupted by a server restart. Anonymous executions cannot be resumed.",
        });
        continue;
      }

      const savedQuery = await db.query.liaseQuery.findFirst({
        where: eq(dbSchema.liaseQuery.id, execution.queryId),
      });

      if (!savedQuery) {
        await db
          .update(dbSchema.liaseQueryExecution)
          .set({
            status: "failed",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dbSchema.liaseQueryExecution.id, executionId));
        await db.insert(dbSchema.liaseQueryExecutionLog).values({
          executionId,
          level: "fatal-error",
          message: `Execution was interrupted. Cannot resume: saved query ${execution.queryId} no longer exists.`,
        });
        continue;
      }

      const liaseRequests = expandAllVariations(savedQuery);
      const liaseQueryOptions = buildLiaseQueryOptions(
        savedQuery,
        liaseRequests,
      );
      const resumeStage = execution.resumeStage ?? "initialising";

      await db.insert(dbSchema.liaseQueryExecutionLog).values({
        executionId,
        level: "info",
        message: `Execution was interrupted by a server restart and is being resumed from stage "${resumeStage}".`,
      });

      console.log(
        `[resume] Resuming execution ${executionId} (query ${savedQuery.id} "${savedQuery.title}") from stage "${resumeStage}"`,
      );

      // Resume in the background – do not block the plugin from finishing.
      runLiaseQueryExecution({
        liaseQueryExecution: execution,
        liaseRequests,
        liaseQueryOptions,
        savedLiaseQuery: savedQuery,
      }).catch((err) => {
        console.error(
          `[resume] Execution ${executionId} failed after resume:`,
          err,
        );
      });
    } catch (err) {
      console.error(
        `[resume] Error handling interrupted execution ${executionId}:`,
        err,
      );
    }
  }
});
