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
    <li
      v-for="media in medias"
      :key="media.id"
      class="item"
      @click="() => emit('mediaClick', media)"
    >
      <MediaPreview
        :media="media"
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
