import type { z } from 'zod'
import type { PhotoSwipeSlide } from '~/components/MediaSwipe.vue'
import type { APIMedia, APIMediaFile } from '~/types/api-media'

type File = z.infer<typeof APIMediaFile>

export default function (medias: ComputedRef<z.infer<typeof APIMedia>[]>) {
  const cachedSlideData: Record<string, PhotoSwipeSlide> = {}

  const slideData = computed(() => medias.value.map((media) => {
    if (media) {
      // TODO a lot of this is copied from MediaPreview so we want to abstract that out at some point
      const maxHeight = computed(() => Math.max(...media.files.map(file => file.height || 0)))
      const fileSortWeight = (file: File) => {
        // Bias towards largest media
        let weight = file.height ? 1 - (file.height / maxHeight.value) : 0
        if (!file.hasVideo) weight += 1
        return weight
      }
      const files = computed(() => media.files.toSorted((a, b) => fileSortWeight(a) - fileSortWeight(b)))

      const displayElement = computed(() => files.value.some(file => file.hasVideo && file.ext !== 'gif') ? 'video' : 'image')
      const videoFile = computed(() => files.value.find(file => file.hasVideo && file.ext !== 'gif'))
      const imageFile = computed(() => files.value.find(file => file.hasImage || file.ext === 'gif'))

      const file = (displayElement.value === 'image' ? imageFile : videoFile).value

      if (file === undefined) {
        return null
      }

      const getSrc = (file: File) => `${document.location.origin}/file/${media.id}/${file?.id}/${file.filename}`
      const posterSrc = computed(() => {
        if (imageFile.value) {
          return getSrc(imageFile.value)
        }
        else if (videoFile.value) {
          return `${document.location.origin}/file/poster/${media.id}/${videoFile.value?.id}/0`
        }
        else {
          return ''
        }
      })

      // We cache slide data objects since Big Shot uses object references
      // to identify slides. If we create a new object each time then Big
      // Shot will think it has entirely new slides each time and clear
      // all existing slides then render all the slides again, wether they're
      // actually new or not. This causes a flash which we want to try and avoid
      if (!cachedSlideData[media.id]) {
        cachedSlideData[media.id] = {
          id: media.id,
          type: displayElement.value,
          src: getSrc(file),
          videoSrc: getSrc(file),
          msrc: getSrc(file) !== posterSrc.value ? posterSrc.value : undefined,
        }
      }
      return cachedSlideData[media.id]
    }
    else {
      return null
    }
  }).filter(slide => slide !== null))

  return slideData
}
