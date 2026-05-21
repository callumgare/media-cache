import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ensurePluginsDir,
  getPluginsDir,
} from "@@/server/lib/liase/plugin-manager";

const execFileAsync = promisify(execFile);

// Matches valid npm package names (scoped and unscoped)
const NPM_PACKAGE_NAME_RE = /^(@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._-]*$/;

export default defineEventHandler(async (event): Promise<string[]> => {
  const name = getQuery(event).name as string | undefined;
  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }
  if (!NPM_PACKAGE_NAME_RE.test(name.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid package name",
    });
  }

  await ensurePluginsDir();
  const pluginsDir = getPluginsDir();

  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["view", name.trim(), "versions", "--json"],
      { cwd: pluginsDir },
    );
    const versions = JSON.parse(stdout.trim()) as string | string[];
    // npm returns a plain string (not an array) when there's only one version
    const arr = Array.isArray(versions) ? versions : [versions];
    return arr.reverse(); // newest first
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Package "${name}" not found on npm`,
    });
  }
});
