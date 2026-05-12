import { Liase, LiaseQuery } from "@liase/core";

const pluginPaths = process.env.LIASE_PLUGINS
  ? process.env.LIASE_PLUGINS.split(",").map((path) => path.trim())
  : [];

const plugins = Promise.all(
  pluginPaths.map((pluginPath) =>
    import(pluginPath).then((module) => module.default),
  ),
);

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
