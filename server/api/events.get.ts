import { createEventStream } from 'h3'
import { taskManager } from '@@/server/utils/tasks'
import type { TaskEvent } from '@@/server/utils/tasks'

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event)

  const taskListener = async (data: TaskEvent) => {
    try {
      await eventStream.push(JSON.stringify(data))
    }
    catch {
      // Stream is closed, ignore. The onClosed handler will clean up.
    }
  }

  const taskListenerWrapper = ((...args: unknown[]) => {
    if (args[0]) taskListener(args[0] as TaskEvent)
  }) as (...args: unknown[]) => void

  taskManager.on('event', taskListenerWrapper)

  eventStream.onClosed(async () => {
    taskManager.off('event', taskListenerWrapper)
    try {
      await eventStream.close()
    }
    catch {
      // Already closed, ignore
    }
  })

  // Send current tasks so the client is immediately up-to-date
  try {
    for (const task of await taskManager.getTasks()) {
      await eventStream.push(JSON.stringify({
        type: 'task.created',
        task,
      } satisfies TaskEvent))
    }
  }
  catch {
    // Stream closed before initial state could be sent
  }

  return eventStream.send()
})
