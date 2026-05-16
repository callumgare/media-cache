import EventEmitter from "node:events";
import { db, dbSchema } from "@@/server/utils/drizzle";
import type { TaskEvent, TaskProvider } from "@@/server/utils/task-provider";
import { eq, inArray, lte, sql } from "drizzle-orm";

export type QueryExecutionTask = {
  type: "query_execution";
  id: string;
  executionId: number;

  startedAt: Date;
  finishedAt: Date | null;
  queryId: number | null;
  status: dbSchema.Status;
  stage?:
    | "fetching-liase-results"
    | "processing-added-or-updated"
    | "processing-removed"
    | "removing-previous-execution-results";
  pageCount: number;

  liaseMediaFound: number;
  liaseMediaNew: number;
  liaseMediaUpdated: number;
  liaseMediaRemoved: number;
  liaseMediaNotSuitable: number;
  liaseMediaUnchanged: number;

  cacheMediaCreated: number;
  cacheMediaUpdated: number;
  cacheMediaUnchanged: number;
  cacheMediaDeleted: number;

  logs: Array<{
    id: number;
    level: dbSchema.LogLevel;
    message: string;
    createdAt: Date;
  }>;
};

class QueryExecutionTaskSystem extends EventEmitter implements TaskProvider {
  private inMemoryTasks: Map<number, QueryExecutionTask> = new Map();
  // Eagerly started so it completes before any test can create a new execution
  // and trigger getTasks() — otherwise the lazy first-call approach would race
  // and mark the newly-created execution as failed.
  private startupRecovery: Promise<void> = this.runStartupRecovery();

  private runStartupRecovery(): Promise<void> {
    // Mark any executions left as 'running' from a previous server process as failed,
    // and add a log entry to each explaining why.
    return db
      .update(dbSchema.liaseQueryExecution)
      .set({
        status: "failed",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dbSchema.liaseQueryExecution.status, "running"))
      .returning()
      .then(async (rows) => {
        if (rows.length === 0) return;
        await db.insert(dbSchema.liaseQueryExecutionLog).values(
          rows.map(
            (row) =>
              ({
                executionId: row.id,
                level: "fatal-error",
                message:
                  "Execution was interrupted by a server restart and did not complete.",
              }) as const,
          ),
        );
      });
  }

  async getTasks(): Promise<QueryExecutionTask[]> {
    await this.startupRecovery; // Make sure startup recovery tasks have completed before returning the tasks
    const tasks: QueryExecutionTask[] = [];

    // Get top 2 executions per queryId from DB across all statuses
    const rankedExecs = db.$with("ranked_execs").as(
      db
        .select({
          id: dbSchema.liaseQueryExecution.id,
          rowNum:
            sql<number>`row_number() over (partition by ${dbSchema.liaseQueryExecution.queryId} order by ${dbSchema.liaseQueryExecution.startedAt} desc)`.as(
              "rowNum",
            ),
        })
        .from(dbSchema.liaseQueryExecution),
    );

    const topExecIds = await db
      .with(rankedExecs)
      .select({ id: rankedExecs.id })
      .from(rankedExecs)
      .where(lte(rankedExecs.rowNum, 2));

    const dbExecs = await db.query.liaseQueryExecution.findMany({
      where: inArray(
        dbSchema.liaseQueryExecution.id,
        topExecIds.map((e) => e.id),
      ),
      with: { logs: true },
    });

    // Build tasks from DB, using in-memory state for any currently running executions
    // since it has more up-to-date counters and logs.
    const coveredExecutionIds = new Set<number>();
    for (const exec of dbExecs) {
      coveredExecutionIds.add(exec.id);
      tasks.push(await this.getTask(exec));
    }

    // Warn if any in-memory running executions have no DB entry (should never happen)
    for (const task of this.inMemoryTasks.values()) {
      if (!coveredExecutionIds.has(task.executionId)) {
        console.warn(
          `Running execution ${task.executionId} has no corresponding DB entry`,
        );
      }
    }

    return tasks;
  }

  /** For use in tests only: discard all in-memory running states without emitting events. */
  clearInMemoryTasks(): void {
    this.inMemoryTasks.clear();
  }

  createTask(
    exec: dbSchema.LiaseQueryExecution,
    executionLogs: dbSchema.LiaseQueryExecutionLog[] = [],
  ): QueryExecutionTask {
    const task: QueryExecutionTask = {
      type: "query_execution",
      id: `query-exec-${exec.id}`,
      executionId: exec.id,
      queryId: exec.queryId,
      startedAt: exec.startedAt,
      finishedAt: exec.finishedAt,
      status: exec.status,
      pageCount: exec.pageCount,

      liaseMediaFound: exec.liaseMediaFound,
      liaseMediaNew: exec.liaseMediaNew,
      liaseMediaUpdated: exec.liaseMediaUpdated,
      liaseMediaRemoved: exec.liaseMediaRemoved,
      liaseMediaNotSuitable: exec.liaseMediaNotSuitable,
      liaseMediaUnchanged: exec.liaseMediaUnchanged,

      cacheMediaCreated: exec.cacheMediaCreated,
      cacheMediaUpdated: exec.cacheMediaUpdated,
      cacheMediaUnchanged: exec.cacheMediaUnchanged,
      cacheMediaDeleted: exec.cacheMediaDeleted,

      logs: executionLogs,
    };
    this.inMemoryTasks.set(exec.id, task);
    this.publish({ type: "task.created", task });
    return task;
  }

  async getTask(
    executionOrExecutionId: dbSchema.LiaseQueryExecution | number,
  ): Promise<QueryExecutionTask> {
    let execution =
      typeof executionOrExecutionId === "number"
        ? undefined
        : executionOrExecutionId;
    const executionId =
      typeof executionOrExecutionId === "number"
        ? executionOrExecutionId
        : executionOrExecutionId.id;
    let task = this.inMemoryTasks.get(executionId);
    if (!task) {
      if (!execution) {
        execution = await db.query.liaseQueryExecution.findFirst({
          where: eq(dbSchema.liaseQueryExecution.id, executionId),
          with: { logs: true },
        });
      }
      if (!execution) {
        throw Error(`No execution found with ID ${executionId}`);
      }
      const executionLogs = await db.query.liaseQueryExecutionLog.findMany({
        where: eq(dbSchema.liaseQueryExecutionLog.executionId, executionId),
        orderBy: (log, { asc }) => asc(log.createdAt),
      });
      task = this.createTask(execution, executionLogs);
    }
    return task;
  }

  async updateTask(
    executionId: number,
    updates: Partial<QueryExecutionTask>,
  ): Promise<void> {
    const task = await this.getTask(executionId);
    Object.assign(task, updates);
    this.publish({
      type: "task.updated",
      task,
    });
  }

  async addLog(
    executionId: number,
    log: QueryExecutionTask["logs"][number],
  ): Promise<void> {
    const task = await this.getTask(executionId);

    task.logs.push(log);
    this.publish({ type: "task.updated", task });
  }

  publish(event: TaskEvent): void {
    this.emit("event", event);
  }
}

// Store on globalThis so the singleton survives Nitro HMR module reloads in dev
declare global {
  var __queryExecutionTaskSystem__: QueryExecutionTaskSystem | undefined;
}

if (!globalThis.__queryExecutionTaskSystem__) {
  globalThis.__queryExecutionTaskSystem__ = new QueryExecutionTaskSystem();
}

export const queryExecutionTaskSystem: QueryExecutionTaskSystem =
  globalThis.__queryExecutionTaskSystem__;
