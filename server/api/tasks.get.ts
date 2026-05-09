import { taskManager } from "@@/server/utils/task-manager";

export default defineEventHandler(async () => {
  return toSuperJSON(await taskManager.getTasks());
});
