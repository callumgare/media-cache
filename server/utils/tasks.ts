import { EventEmitter } from 'node:events'

export interface Task {
  type: string
  id: string
}

export interface TaskEvent {
  type: 'task.created' | 'task.updated' | 'task.completed' | 'task.failed'
  task: Task
}

export interface TaskProvider {
  getTasks(): Promise<Task[]> | Task[]
}

class TaskManager extends EventEmitter {
  private providers: TaskProvider[] = []

  registerProvider(provider: TaskProvider): void {
    this.providers.push(provider)
  }

  async getTasks(): Promise<Task[]> {
    const results = await Promise.all(this.providers.map(p => p.getTasks()))
    return results.flat()
  }

  publish(event: TaskEvent): void {
    this.emit('event', event)
  }

  override emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }

  override off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener)
  }
}

// Store on globalThis so the singleton survives Nitro HMR module reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __taskManager__: TaskManager | undefined
}

if (!globalThis.__taskManager__) {
  globalThis.__taskManager__ = new TaskManager()
  globalThis.__taskManager__.setMaxListeners(200)
}

export const taskManager: TaskManager = globalThis.__taskManager__
