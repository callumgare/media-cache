import { EventEmitter } from "node:events";
import {
  type QueryExecutionTask,
  queryExecutionTaskSystem,
} from "@@/server/lib/liase/execution-tasks";
import type { TaskEvent, TaskProvider } from "./task-provider";

export type AnyTask = QueryExecutionTask;
export type AnyTaskProvider = typeof queryExecutionTaskSystem;

class TaskManager extends EventEmitter {
  private providers: AnyTaskProvider[] = [];

  constructor() {
    super();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Import and register all providers
    this.providers.push(queryExecutionTaskSystem);
    queryExecutionTaskSystem.on("event", (event: TaskEvent) => {
      this.publish(event);
    });
  }

  async getTasks(): Promise<AnyTask[]> {
    const results = await Promise.all(this.providers.map((p) => p.getTasks()));
    return results.flat();
  }

  publish(event: TaskEvent): void {
    this.emit("event", event);
  }

  override emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}

// Store on globalThis so the singleton survives Nitro HMR module reloads in dev
declare global {
  var __taskManager__: TaskManager | undefined;
}

if (!globalThis.__taskManager__) {
  globalThis.__taskManager__ = new TaskManager();
  globalThis.__taskManager__.setMaxListeners(200);
}

export const taskManager: TaskManager = globalThis.__taskManager__;
