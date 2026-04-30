import { EventEmitter } from 'node:events'

export interface ExecutionStartedEvent {
  type: 'execution.started'
  executionId: number
  queryId: number | null
}

export interface ExecutionPageCompleteEvent {
  type: 'execution.page_complete'
  executionId: number
  queryId: number | null
  pageCount: number
  mediaFound: number
  status: string
}

export interface ExecutionLogEvent {
  type: 'execution.log'
  executionId: number
  queryId: number | null
  log: {
    id: number
    level: string
    message: string
    createdAt: string
  }
}

export interface ExecutionCompletedEvent {
  type: 'execution.completed'
  executionId: number
  queryId: number | null
  stats: {
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
  }
}

export interface ExecutionFailedEvent {
  type: 'execution.failed'
  executionId: number
  queryId: number | null
  error: string
}

export type ServerEvent
  = ExecutionStartedEvent
  | ExecutionPageCompleteEvent
  | ExecutionLogEvent
  | ExecutionCompletedEvent
  | ExecutionFailedEvent

// In-memory state of currently running executions (reset on server restart)
export interface RunningExecutionState {
  executionId: number
  queryId: number | null
  pageCount: number
  mediaFound: number
  status: string
  startedAt: Date
}

class ServerEventBus extends EventEmitter {
  private runningExecutions = new Map<number, RunningExecutionState>()

  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener)
  }

  publish(data: ServerEvent): void {
    if (data.type === 'execution.started') {
      this.runningExecutions.set(data.executionId, {
        executionId: data.executionId,
        queryId: data.queryId,
        pageCount: 0,
        mediaFound: 0,
        status: 'Fetching pages...',
        startedAt: new Date(),
      })
    }
    else if (data.type === 'execution.page_complete') {
      const state = this.runningExecutions.get(data.executionId)
      if (state) {
        state.pageCount = data.pageCount
        state.mediaFound = data.mediaFound
        state.status = data.status
      }
    }
    else if (data.type === 'execution.completed' || data.type === 'execution.failed') {
      this.runningExecutions.delete(data.executionId)
    }
    this.emit('event', data)
  }

  getRunningExecutions(): RunningExecutionState[] {
    return [...this.runningExecutions.values()]
  }
}

export const serverEventBus = new ServerEventBus()
serverEventBus.setMaxListeners(200)
