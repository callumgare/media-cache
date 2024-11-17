import type { z } from 'zod'
import type { APIMedia, APIMediaFile } from '~/types/api-media'

type File = z.infer<typeof APIMediaFile>

export default function (medias: ComputedRef<z.infer<typeof APIMedia>[]>) {
  const cachedSlideData = {}

  const slideData = computed(() => medias.value.map((media) => {
    if (media) {
      // TODO a lot of this is copied from MediaPreview so we want to abstract that out at some point
      const fileSortWeight = (file: File) => {
        if (file.hasVideo) return 0
        return 1
      }
      const files = computed(() => media.files.toSorted((a, b) => fileSortWeight(a) - fileSortWeight(b)))

      const displayElement = computed(() => files.value.some(file => file.hasVideo && file.ext !== 'gif') ? 'video' : 'image')
      const videoFile = computed(() => files.value.find(file => file.hasVideo && file.ext !== 'gif'))
      const imageFile = computed(() => files.value.find(file => file.hasImage || file.ext === 'gif'))

      const file = (displayElement.value === 'image' ? imageFile : videoFile).value

      if (file === undefined) {
        return {}
      }

      const getSrc = (file: File) => `${document.location.origin}/file/${media.id}/${file?.id}/${file?.url}`

      // We cache slide data objects since Big Shot uses object references
      // to identify slides. If we create a new object each time then Big
      // Shot will think it has entirely new slides each time and clear
      // all existing slides then render all the slides again, wether they're
      // actually new or not. This causes a flash which we want to try and avoid
      if (!cachedSlideData[media.id]) {
        cachedSlideData[media.id] = {
          type: displayElement.value,
          src: getSrc(file),
          duration: undefined,
          tags: [],
          title: media.title,
          media,
          sources: [],
        }
      }
      return cachedSlideData[media.id]
    }
    else {
      return { }
    }
  }))

  return slideData
}
