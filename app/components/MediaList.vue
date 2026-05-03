<script setup lang="ts">
import type { z } from 'zod'
import type { APIMedia } from '../types/api-media'

defineProps<{
  medias: z.infer<typeof APIMedia>[]
}>()

const emit = defineEmits<{
  (e: 'mediaClick', value: z.infer<typeof APIMedia>): void
}>()
</script>

<template>
  <ul>
    <!-- data-media-id is used by MediaSwipe to determine where to center the growth effect -->
    <li
      v-for="media in medias"
      :key="media.id"
      :data-media-id="media.id"
      class="item"
    >
      <MediaPreview
        :media="media"
        @media-click="() => emit('mediaClick', media)"
      />
    </li>
  </ul>
</template>

<style scoped>
  ul {
    padding-inline-start: 0;
    list-style-type: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    justify-content: center;
    align-items: center;

    li {
      max-width: 100%;
    }
  }
</style>
