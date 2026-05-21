import { Liase, LiaseQuery } from "@liase/core";
import { loadInstalledPlugins } from "./plugin-manager";

// Managed plugins from the plugin directory (installed via the admin UI).
// Re-assigned by reloadManagedPlugins() after any install/remove/update.
let plugins = loadInstalledPlugins();

export function reloadManagedPlugins(): void {
  plugins = loadInstalledPlugins();
}

export async function getLiaseQuery(
  options: ConstructorParameters<typeof LiaseQuery>[0],
): Promise<LiaseQuery> {
  return new LiaseQuery({
    ...options,
    liaseOptions: {
      plugins: [...(options?.liaseOptions?.plugins ?? []), ...(await plugins)],
    },
  });
}

export async function getLiase(
  options?: ConstructorParameters<typeof Liase>[0],
): Promise<Liase> {
  const liase = new Liase(options);
  for (const plugin of await plugins) {
    liase.loadPlugin(plugin);
  }
  return liase;
}
