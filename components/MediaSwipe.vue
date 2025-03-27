<script setup lang="ts">
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import { PhotoSwipeSizeOnLoadPlugin } from '~/lib/photo-swipe/plugins/size-on-load'
import { PhotoSwipeDebugPlugin } from '~/lib/photo-swipe/plugins/debug'
import { PhotoSwipeCustomZoomPlugin } from '~/lib/photo-swipe/plugins/custom-zoom'
import { PhotoSwipeCustomVideoPlugin } from '~/lib/photo-swipe/plugins/custom-video'

export type PhotoSwipeSlide = {
  src: string
}

const props = defineProps<{
  slides: PhotoSwipeSlide[]
  total?: number
}>()

const emit = defineEmits<{
  (e: 'change', value: {
    newIndex: number
  }): void
}>()

const uiState = useUiState()

const photoSwipe = shallowRef<PhotoSwipeLightbox>()

watch(() => props.slides, () => {
  if (photoSwipe.value) {
    const newSlides = props.slides.map(toRaw)
    const { dataSource } = photoSwipe.value.options
    if (Array.isArray(dataSource)) {
      dataSource.splice(0, dataSource.length, ...newSlides)
    }
  }
})

onMounted(() => {
  photoSwipe.value = new PhotoSwipeLightbox({
    dataSource: props.slides,
    pswpModule: PhotoSwipe,
    allowPanToNext: false, // prevent swiping to the next slide when image is zoomed
    wheelToZoom: true, // enable wheel-based zoom
  })
  new PhotoSwipeCustomVideoPlugin(photoSwipe.value, {})
  new PhotoSwipeSizeOnLoadPlugin(photoSwipe.value, {})
  if (uiState.debugMode) {
    new PhotoSwipeDebugPlugin(photoSwipe.value)
  }
  new PhotoSwipeCustomZoomPlugin(photoSwipe.value)

  photoSwipe.value.addFilter('numItems', (numItems) => {
    return (typeof props.total === 'number') ? props.total : numItems
  })

  photoSwipe.value.addFilter('thumbEl', (thumbEl, data) => {
    const el = document.querySelector(`[data-media-id="${data.id}"] img, [data-media-id="${data.id}"] video`)
    if (el) {
      return el as HTMLElement
    }
    if (thumbEl) {
      return thumbEl
    }
    const errorMessage = 'No thumb element found'
    if (uiState.debugMode) {
      console.info(thumbEl, data)
      throw Error(errorMessage)
    }
    console.error(errorMessage)
    return (undefined as unknown) as HTMLElement
  })

  registerMediaSwipe(photoSwipe.value)

  photoSwipe.value.on('change', () => {
    if (photoSwipe.value?.pswp) {
      emit('change', {
        newIndex: photoSwipe.value.pswp.currIndex,
      })
    }
  })

  photoSwipe.value.init()
})

onUnmounted(() => {
  if (photoSwipe.value) {
    photoSwipe.value.destroy()
    photoSwipe.value = undefined
  }
})
</script>

<template>
  <div />
</template>
