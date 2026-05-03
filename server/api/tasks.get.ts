import { taskManager } from '@@/server/utils/task-manager'
// Import to make sure it's registered when the API route is hit
import '@@/server/lib/media-finder/execution-tasks'

export default defineEventHandler(async () => {
  return await taskManager.getTasks()
})
