import { reloadManagedPlugins } from "@@/server/lib/liase";
import {
  ensurePluginsDir,
  getPluginsDir,
  spawnNpm,
} from "@@/server/lib/liase/plugin-manager";
import type { PluginInstallBody, PluginNpmMessage } from "@@/types/api-plugins";

// Matches valid npm package names (scoped and unscoped)
const NPM_PACKAGE_NAME_RE = /^(@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._-]*$/;
export default defineEventHandler(async (event) => {
  const body = await readBody<PluginInstallBody>(event);
  const name = body.name?.trim();
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }
  if (!NPM_PACKAGE_NAME_RE.test(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid package name",
    });
  }
  const version = body.version?.trim();
  if (version && version.length > 500) {
    throw createError({
      statusCode: 400,
      statusMessage: "Version string too long",
    });
  }

  await ensurePluginsDir();
  const pluginsDir = getPluginsDir();
  const packageSpec = version ? `${name}@${version}` : name;

  const eventStream = createEventStream(event);

  (async () => {
    try {
      await eventStream.push(
        JSON.stringify({
          type: "output",
          data: `Installing ${packageSpec}...\n`,
        } satisfies PluginNpmMessage),
      );
      await spawnNpm(["install", packageSpec], pluginsDir, (data) =>
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
