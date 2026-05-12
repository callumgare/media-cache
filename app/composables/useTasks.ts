import type { QueryExecutionTask } from "@@/server/lib/liase/execution-tasks";
import type { TaskEvent } from "@@/server/utils/task-provider";
import type { ToastServiceMethods } from "primevue/toastservice";
import superjson from "superjson";
import type { AnyTask } from "~~/server/utils/task-manager";

export type { QueryExecutionTask };

// Shared reactive state across all component instances
const tasks = ref(new Map<string, AnyTask>());
const error = ref<unknown>(null);
const tasksLoaded = ref(false);
let eventSource: EventSource | null = null;
let listenerCount = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let toast: ToastServiceMethods | null = null;

function deserializeTask(raw: unknown): AnyTask {
  const task = raw as QueryExecutionTask & {
    startedAt: string;
    finishedAt: string | null;
  };
  if (task.type === "query_execution") {
    const qet: QueryExecutionTask = {
      ...task,
      startedAt: new Date(task.startedAt),
      finishedAt: task.finishedAt ? new Date(task.finishedAt) : null,
    };
    return qet;
  }
  return task;
}

function handleEvent(raw: string) {
  let parsed: Record<string, unknown>;
  try {
    parsed = superjson.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  if (typeof parsed.type !== "string" || !parsed.type.startsWith("task."))
    return;

  const event = parsed as unknown as TaskEvent;
  const task = deserializeTask(event.task);
  tasks.value = new Map(tasks.value).set(task.id, task);
}

async function fetchInitialTasks() {
  try {
    const { $superFetch } = useNuxtApp();
    const data = await $superFetch("/api/tasks");
    const newTasks = new Map<string, AnyTask>();
    for (const raw of data) {
      const task = deserializeTask(raw);
      newTasks.set(task.id, task);
    }
    tasks.value = newTasks;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    toast?.add({
      severity: "error",
      summary: "Failed to load tasks",
      detail,
      life: 5000,
    });
    error.value = err;
    console.warn("Failed to fetch initial tasks:", err);
  } finally {
    tasksLoaded.value = true;
  }
}

function connect() {
  if (eventSource) return;
  fetchInitialTasks();
  eventSource = new EventSource("/api/events");
  eventSource.onmessage = (e) => handleEvent(e.data);
  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    // Reconnect after a delay
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      if (listenerCount > 0) connect();
    }, 3000);
  };
}

function disconnect() {
  eventSource?.close();
  eventSource = null;
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  tasks.value = new Map();
  error.value = null;
  tasksLoaded.value = false;
}

export function useTasks() {
  toast = useToast();

  onMounted(() => {
    listenerCount++;
    connect();
  });

  onUnmounted(() => {
    listenerCount--;
    if (listenerCount === 0) disconnect();
  });

  const runningExecutions = computed(() => {
    const map = new Map<number, QueryExecutionTask>();
    for (const task of tasks.value.values()) {
      if (task.type === "query_execution") {
        const qet = task as QueryExecutionTask;
        if (qet.finishedAt === null) map.set(qet.executionId, qet);
      }
    }
    return map;
  });

  const runningExecutionList = computed(() => [
    ...runningExecutions.value.values(),
  ]);

  return {
    tasks,
    tasksLoaded,
    tasksError: error,
    runningExecutions,
    runningExecutionList,
  };
}
