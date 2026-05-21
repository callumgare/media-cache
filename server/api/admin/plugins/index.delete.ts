import { reloadManagedPlugins } from "@@/server/lib/liase";
import {
  ensurePluginsDir,
  getPluginsDir,
  spawnNpm,
} from "@@/server/lib/liase/plugin-manager";
import type { PluginNpmMessage, PluginRemoveBody } from "@@/types/api-plugins";

export default defineEventHandler(async (event) => {
  const body = await readBody<PluginRemoveBody>(event);
  const name = body.name?.trim();
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }

  await ensurePluginsDir();
  const pluginsDir = getPluginsDir();

  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push(
        JSON.stringify({
          type: "output",
          data: `Removing ${name}...\n`,
        } satisfies PluginNpmMessage),
      );
      await spawnNpm(["uninstall", name], pluginsDir, (data) =>
        eventStream.push(
          JSON.stringify({ type: "output", data } satisfies PluginNpmMessage),
        ),
      );
      reloadManagedPlugins();
      await eventStream.push(
        JSON.stringify({ type: "done" } satisfies PluginNpmMessage),
      );
    } catch (err) {
      await eventStream.push(
        JSON.stringify({
          type: "error",
          message: String(err instanceof Error ? err.message : err),
        } satisfies PluginNpmMessage),
      );
    } finally {
      await eventStream.flush();
      await eventStream.close();
    }
  })();

  return eventStream.send();
});
