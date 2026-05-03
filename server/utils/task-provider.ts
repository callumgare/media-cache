import type { EventEmitter } from 'node:events'

export interface Task {
  type: string
  id: string
}

export interface TaskEvent {
  type: 'task.created' | 'task.updated' | 'task.completed' | 'task.failed'
  task: Task
}

export interface TaskProvider extends EventEmitter {
  getTasks(): Promise<Task[]> | Task[]
}
