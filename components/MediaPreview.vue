<script setup lang="ts">
import type { z } from 'zod'
import Hls from 'hls.js'

import type { APIMedia, APIMediaFile } from '../types/api-media'

type File = z.infer<typeof APIMediaFile>

const props = defineProps<{
  media: z.infer<typeof APIMedia>
}>()

const maxHeight = computed(() => Math.max(...props.media.files.map(file => file.height || 0)))

const thumbnailDisplayHeight = 300
const fileSortWeight = (file: File) => {
  // Bias towards media that is closest to display height
  let weight = file.height ? (Math.abs(file.height - thumbnailDisplayHeight) / Math.max(maxHeight.value, thumbnailDisplayHeight)) : 1
  if (!file.hasVideo) weight += 1
  return weight
}
const uiState = useUiState()

const files = computed(() => props.media.files.toSorted((a, b) => fileSortWeight(a) - fileSortWeight(b)))

const displayElement = computed(() => files.value.some(file => file.hasVideo && file.ext !== 'gif') ? 'video' : 'image')
const videoFile = computed(() => files.value.find(file => file.hasVideo && file.ext !== 'gif'))
const imageFile = computed(() => files.value.find(file => file.hasImage || file.ext === 'gif'))

const getSrc = (file: File) => `${document.location.origin}/file/${props.media.id}/${file?.id}/${file?.url}`

const posterSrc = computed(() => {
  if (imageFile.value) {
    return getSrc(imageFile.value)
  }
  else if (videoFile.value) {
    return `${document.location.origin}/file/poster/${props.media.id}/${videoFile.value?.id}/${thumbnailDisplayHeight}`
  }
  else {
    return ''
  }
})

const hls = ref<Hls | null>(null)

onMounted(() => {
  const file = videoFile.value

  if (!file || videoRef.value === null) {
    return
  }

  const videoSrc = getSrc(file)
  if (file.ext === 'm3u8') {
    if (videoRef.value.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.value.src = videoSrc
    }
    else if (Hls.isSupported()) {
      hls.value = new Hls()
    }
    else {
      throw Error('Browser can\'t play HLS')
    }
  }
  else {
    videoRef.value.src = videoSrc
  }
})

const videoRef = ref<HTMLVideoElement | null>(null)

function playHlsVideo() {
  const file = videoFile.value
  if (!file || videoRef.value === null || !hls.value) {
    return
  }

  const videoSrc = getSrc(file)
  hls.value.loadSource(videoSrc)
  hls.value?.attachMedia(videoRef.value)
}
</script>

<template>
  <div
    v-if="videoFile || imageFile"
    class="item"
  >
    <pre v-if="uiState.debugMode">{{ JSON.stringify(media, null, 2) }}</pre>
    <video
      v-if="displayElement === 'video'"
      ref="videoRef"
      controls
      :poster="posterSrc"
      preload="none"
      playsinline="true"
      @play="playHlsVideo"
    />
    <img
      v-else-if="displayElement === 'image'"
      :src="imageFile ? getSrc(imageFile) : ''"
    >
    <div v-else>
      Unknown display type {{ displayElement }}
    </div>
  </div>
  <div v-else>
    file not valid
  </div>
</template>

<style scoped>
  .item {
    background-color: grey;
  }

  img, video {
    max-height: 300px;
    max-width: 100%;
    display: block;
  }

  .info {
    min-width: 100px;
    max-width: 200px;
  }

  a {
  pre {
    overflow: auto;
  }

    display: block;
  }
</style>
