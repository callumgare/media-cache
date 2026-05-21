import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ensurePluginsDir,
  getInstalledVersion,
  getPluginsDir,
  readPluginsPackageJson,
} from "@@/server/lib/liase/plugin-manager";
import type { PluginListResponse } from "@@/types/api-plugins";

const execFileAsync = promisify(execFile);

export default defineEventHandler(async (): Promise<PluginListResponse> => {
  await ensurePluginsDir();
  const { dependencies = {} } = await readPluginsPackageJson();
  const pluginsDir = getPluginsDir();

  // npm outdated exits with code 1 when outdated packages exist — that's expected
  let outdatedInfo: Record<
    string,
    { current: string; wanted: string; latest: string }
  > = {};
  try {
    const { stdout } = await execFileAsync("npm", ["outdated", "--json"], {
      cwd: pluginsDir,
    });
    if (stdout.trim()) {
      outdatedInfo = JSON.parse(stdout) as typeof outdatedInfo;
    }
  } catch (err) {
    const execErr = err as { stdout?: string };
    if (execErr.stdout?.trim()) {
      try {
        outdatedInfo = JSON.parse(execErr.stdout) as typeof outdatedInfo;
      } catch {
        // ignore parse error — outdated info is best-effort
      }
    }
  }

  return Promise.all(
    Object.entries(dependencies).map(async ([name, listedVersion]) => ({
      name,
      listedVersion,
      installedVersion: await getInstalledVersion(name),
      latestVersion: outdatedInfo[name]?.latest ?? null,
    })),
  );
});
