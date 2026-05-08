import { eq, inArray, lte, sql } from 'drizzle-orm'
import { db, dbSchema } from '@@/server/utils/drizzle'
import type { TaskEvent, TaskProvider } from '@@/server/utils/task-provider'
import EventEmitter from 'node:events'

export interface QueryExecutionTask {
  type: 'query_execution'
  id: string
  executionId: number
  queryId: number | null
  status: string
  pageCount: number
  mediaFound: number
  mediaNew: number
  mediaUpdated: number
  mediaRemoved: number
  mediaNotSuitable: number
  mediaUnchanged: number
  warningCount: number
  nonFatalErrorCount: number
  fatalErrorCount: number
  startedAt: Date
  finishedAt: Date | null
  error: string | null
  logs: Array<{ id: number, level: string, message: string, createdAt: string }>
}

// In-memory live state for a currently running execution
interface RunningExecutionState {
  executionId: number
  queryId: number | null
  mediaNotSuitable: number
  mediaUnchanged: number
  startedAt: Date
  // Mutable fields updated throughout the run
  status: string
  pageCount: number
  mediaFound: number
  mediaNew: number
  mediaUpdated: number
  mediaRemoved: number
  warningCount: number
  nonFatalErrorCount: number
  fatalErrorCount: number
  logs: Array<{ id: number, level: string, message: string, createdAt: string }>
}

class QueryExecutionTaskSystem extends EventEmitter implements TaskProvider {
  private runningStates = new Map<number, RunningExecutionState>()
  private startupRecovery: Promise<void>

  constructor() {
    super()
    // Mark any executions left as 'running' from a previous server process as failed,
    // and add a log entry to each explaining why.
    this.startupRecovery = db.update(dbSchema.finderQueryExecution)
      .set({ status: 'failed', finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(dbSchema.finderQueryExecution.status, 'running'))
      .returning()
      .then(async (rows) => {
        if (rows.length === 0) return
        await db.insert(dbSchema.finderQueryExecutionLog).values(
          rows.map(row => ({
            executionId: row.id,
            level: 'fatal_error',
            message: 'Execution was interrupted by a server restart and did not complete.',
          })),
        )
      })
  }

  async getTasks(): Promise<QueryExecutionTask[]> {
    await this.startupRecovery
    const tasks: QueryExecutionTask[] = []

    // Get top 2 executions per queryId from DB across all statuses
    const rankedExecs = db.$with('ranked_execs').as(
      db.select({
        id: dbSchema.finderQueryExecution.id,
        rowNum: sql<number>`row_number() over (partition by ${dbSchema.finderQueryExecution.queryId} order by ${dbSchema.finderQueryExecution.startedAt} desc)`.as('rowNum'),
      }).from(dbSchema.finderQueryExecution),
    )

    const topExecIds = await db.with(rankedExecs)
      .select({ id: rankedExecs.id })
      .from(rankedExecs)
      .where(lte(rankedExecs.rowNum, 2))

    const dbExecs = await db.query.finderQueryExecution.findMany({
      where: inArray(dbSchema.finderQueryExecution.id, topExecIds.map(e => e.id)),
      with: { logs: true },
    })

    // Build tasks from DB, using in-memory state for any currently running executions
    // since it has more up-to-date counters and logs.
    const coveredExecutionIds = new Set<number>()
    for (const exec of dbExecs) {
      coveredExecutionIds.add(exec.id)
      const runningState = this.runningStates.get(exec.id)
      tasks.push(runningState ? this.stateToTask(runningState) : this.dbRowToTask(exec))
    }

    // Warn if any in-memory running executions have no DB entry (should never happen)
    for (const state of this.runningStates.values()) {
      if (!coveredExecutionIds.has(state.executionId)) {
        console.warn(`Running execution ${state.executionId} has no corresponding DB entry`)
      }
    }

    return tasks
  }

  /** For use in tests only: discard all in-memory running states without emitting events. */
  clearRunningStates(): void {
    this.runningStates.clear()
  }

  create(exec: dbSchema.FinderQueryExecution): void {
    const state: RunningExecutionState = {
      executionId: exec.id,
      queryId: exec.queryId,
      mediaNotSuitable: 0,
      mediaUnchanged: 0,
      startedAt: exec.startedAt,
      status: 'Fetching pages...',
      pageCount: 0,
      mediaFound: 0,
      mediaNew: 0,
      mediaUpdated: 0,
      mediaRemoved: 0,
      warningCount: 0,
      nonFatalErrorCount: 0,
      fatalErrorCount: 0,
      logs: [],
    }
    this.runningStates.set(exec.id, state)
    this.publish({ type: 'task.created', task: this.stateToTask(state) })
  }

  update(
    executionId: number,
    updates: Partial<Pick<RunningExecutionState, 'status' | 'pageCount' | 'mediaFound' | 'mediaNew' | 'mediaUpdated' | 'mediaRemoved'>>,
  ): void {
    const state = this.runningStates.get(executionId)
    if (!state) return
    Object.assign(state, updates)
    this.publish({ type: 'task.updated', task: this.stateToTask(state) })
  }

  addLog(
    executionId: number,
    log: { id: number, level: string, message: string, createdAt: string },
    level: 'warning' | 'non_fatal_error' | 'fatal_error',
  ): void {
    const state = this.runningStates.get(executionId)
    if (!state) return
    state.logs.push(log)
    if (level === 'warning') state.warningCount++
    else if (level === 'non_fatal_error') state.nonFatalErrorCount++
    else state.fatalErrorCount++
    this.publish({ type: 'task.updated', task: this.stateToTask(state) })
  }

  complete(exec: dbSchema.FinderQueryExecution): void {
    const logs = this.runningStates.get(exec.id)?.logs ?? []
    this.runningStates.delete(exec.id)
    const task: QueryExecutionTask = { ...this.dbRowToTask(exec), logs }
    this.publish({ type: 'task.completed', task })
  }

  fail(exec: dbSchema.FinderQueryExecution, error: string): void {
    const logs = this.runningStates.get(exec.id)?.logs ?? []
    this.runningStates.delete(exec.id)
    const task: QueryExecutionTask = { ...this.dbRowToTask(exec), error, logs }
    this.publish({ type: 'task.failed', task })
  }

  private stateToTask(state: RunningExecutionState): QueryExecutionTask {
    return {
      type: 'query_execution',
      id: `query-exec-${state.executionId}`,
      executionId: state.executionId,
      queryId: state.queryId,
      status: state.status,
      pageCount: state.pageCount,
      mediaFound: state.mediaFound,
      mediaNew: state.mediaNew,
      mediaUpdated: state.mediaUpdated,
      mediaRemoved: state.mediaRemoved,
      mediaNotSuitable: state.mediaNotSuitable,
      mediaUnchanged: state.mediaUnchanged,
      warningCount: state.warningCount,
      nonFatalErrorCount: state.nonFatalErrorCount,
      fatalErrorCount: state.fatalErrorCount,
      startedAt: state.startedAt,
      finishedAt: null,
      error: null,
      logs: [...state.logs],
    }
  }

  private dbRowToTask(
    exec: dbSchema.FinderQueryExecution & { logs?: dbSchema.FinderQueryExecutionLog[] },
  ): QueryExecutionTask {
    return {
      type: 'query_execution',
      id: `query-exec-${exec.id}`,
      executionId: exec.id,
      queryId: exec.queryId,
      status: exec.status,
      pageCount: exec.pageCount,
      mediaFound: exec.mediaFound,
      mediaNew: exec.mediaNew,
      mediaUpdated: exec.mediaUpdated,
      mediaRemoved: exec.mediaRemoved,
      mediaNotSuitable: exec.mediaNotSuitable,
      mediaUnchanged: exec.mediaUnchanged,
      warningCount: exec.warningCount,
      nonFatalErrorCount: exec.nonFatalErrorCount,
      fatalErrorCount: exec.fatalErrorCount,
      startedAt: exec.startedAt,
      finishedAt: exec.finishedAt ?? null,
      error: null,
      logs: (exec.logs ?? []).map(l => ({
        id: l.id,
        level: l.level,
        message: l.message,
        createdAt: l.createdAt.toISOString(),
      })),
    }
  }

  publish(event: TaskEvent): void {
    this.emit('event', event)
  }
}

// Store on globalThis so the singleton survives Nitro HMR module reloads in dev
declare global {

  var __queryExecutionTaskSystem__: QueryExecutionTaskSystem | undefined
}

if (!globalThis.__queryExecutionTaskSystem__) {
  globalThis.__queryExecutionTaskSystem__ = new QueryExecutionTaskSystem()
}

export const queryExecutionTaskSystem: QueryExecutionTaskSystem = globalThis.__queryExecutionTaskSystem__
