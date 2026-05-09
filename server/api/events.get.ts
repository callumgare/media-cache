import { taskManager } from "@@/server/utils/task-manager";
import type { TaskEvent } from "@@/server/utils/task-provider";
import { createEventStream } from "h3";
import superjson from "superjson";

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  const taskListener = async (data: TaskEvent) => {
    try {
      await eventStream.push(superjson.stringify(data));
    } catch {
      // Stream is closed, ignore. The onClosed handler will clean up.
    }
  };

  const taskListenerWrapper = (...args: unknown[]): void => {
    if (args[0]) taskListener(args[0] as TaskEvent);
  };

  taskManager.on("event", taskListenerWrapper);

  eventStream.onClosed(async () => {
    taskManager.off("event", taskListenerWrapper);
    try {
      await eventStream.close();
    } catch {
      // Already closed, ignore
    }
  });

  return eventStream.send();
});
