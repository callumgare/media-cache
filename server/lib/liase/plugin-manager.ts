import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "@liase/core";

export function getPluginsDir(): string {
  return (
    process.env.PLUGINS_DIR ||
    path.join(os.homedir(), ".media-cache", "plugins")
  );
}

export type PluginPackageJson = {
  dependencies?: Record<string, string>;
};

export async function ensurePluginsDir(): Promise<void> {
  const dir = getPluginsDir();
  await fs.mkdir(dir, { recursive: true });
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    await fs.writeFile(
      pkgPath,
      `${JSON.stringify(
        {
          name: "media-cache-plugins",
          private: true,
          type: "module",
          dependencies: {},
        },
        null,
        2,
      )}\n`,
    );
  }
}

export async function readPluginsPackageJson(): Promise<PluginPackageJson> {
  await ensurePluginsDir();
  const pkgPath = path.join(getPluginsDir(), "package.json");
  const content = await fs.readFile(pkgPath, "utf-8");
  return JSON.parse(content) as PluginPackageJson;
}

export async function getInstalledVersion(
  name: string,
): Promise<string | null> {
  try {
    const pkgPath = path.join(
      getPluginsDir(),
      "node_modules",
      name,
      "package.json",
    );
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

export async function loadInstalledPlugins(): Promise<Plugin[]> {
  const { dependencies = {} } = await readPluginsPackageJson();
  const pluginsDir = getPluginsDir();
  const plugins: Plugin[] = [];
  const req = createRequire(path.join(pluginsDir, "package.json"));

  for (const name of Object.keys(dependencies)) {
    try {
      const resolvedPath = req.resolve(name);
      const pluginModule = await import(pathToFileURL(resolvedPath).href);
      plugins.push((pluginModule.default ?? pluginModule) as Plugin);
    } catch (err) {
      console.warn(`Failed to load liase plugin "${name}":`, err);
    }
  }

  return plugins;
}

export function spawnNpm(
  args: string[],
  cwd: string,
  onData: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npm", args, { cwd });
    proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm exited with code ${code}`));
    });
  });
}
