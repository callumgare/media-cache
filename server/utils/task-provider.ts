import type { EventEmitter } from "node:events";

export interface BaseTask {
  type: string;
  id: string;
}

export interface TaskEvent {
  type: "task.created" | "task.updated" | "task.completed" | "task.failed";
  task: BaseTask;
}

export interface TaskProvider extends EventEmitter {
  getTasks(): Promise<BaseTask[]> | BaseTask[];
}
