import { MediaFinderQuery, MediaFinder } from 'media-finder'

const pluginPaths = process.env.MEDIA_FINDER_PLUGINS ? process.env.MEDIA_FINDER_PLUGINS.split(',').map(path => path.trim()) : []

const plugins = Promise.all(
  pluginPaths.map(pluginPath => import(pluginPath).then(module => module.default)),
)

export async function getMediaQuery(options: ConstructorParameters<typeof MediaFinderQuery>[0]): Promise<MediaFinderQuery> {
  return new MediaFinderQuery({
    ...options,
    finderOptions: {
      plugins: [
        ...(options?.finderOptions?.plugins ?? []),
        ...(await plugins),
      ],
    },
  })
}

export async function getMediaFinder(options?: ConstructorParameters<typeof MediaFinder>[0]): Promise<MediaFinder> {
  return new MediaFinder({
    ...options,
    plugins: [
      ...(options?.plugins ?? []),
      ...(await plugins),
    ],
  })
}
