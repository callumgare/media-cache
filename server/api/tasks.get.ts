import { taskManager } from '@@/server/utils/tasks'

export default defineEventHandler(async () => {
  return await taskManager.getTasks()
})
