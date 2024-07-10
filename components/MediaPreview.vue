<script setup lang="ts">
import type { z } from 'zod'
import '@mux/mux-player'

import type { APIMedia, APIMediaFile } from '../types/api-media'

const props = defineProps<{
  media: z.infer<typeof APIMedia>
}>()

const displayElement = computed(() => props.media.files.some(file => file.hasVideo && file.ext !== 'gif') ? 'video' : 'image')
const videoFile = computed(() => props.media.files.find(file => file.hasVideo && file.ext !== 'gif'))
const imageFile = computed(() => props.media.files.find(file => file.hasImage || file.ext === 'gif'))

const getSrc = (file: z.infer<typeof APIMediaFile>) => `${document.location.origin}/file/${props.media.id}/${file?.id}/${file?.url}`
</script>

<template>
  <div
    v-if="videoFile || imageFile"
    class="item"
  >
    <mux-player
      v-if="displayElement === 'video'"
      :src="videoFile ? getSrc(videoFile) : ''"
      :poster="imageFile ? getSrc(imageFile) : ''"
      stream-type="on-demand"
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

  img, video, mux-player {
    max-height: 300px;
    max-width: 100%;
    display: block;
  }

  mux-player {
    height: 10000px;
  }

  .info {
    min-width: 100px;
    max-width: 200px;
  }

  a {
    display: block;
  }
</style>
