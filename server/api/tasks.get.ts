import { taskManager } from "@@/server/utils/task-manager";

export default defineEventHandler(async () => {
  return await taskManager.getTasks();
});
