<script setup lang="ts">
import type { z } from 'zod'
import type { APIMedia } from '../types/api-media'

defineProps<{
  medias: z.infer<typeof APIMedia>[]
}>()
</script>

<template>
  <ul>
    <li
      v-for="media in medias"
      :key="media.id"
      class="item"
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
  }

  li {
    max-height: 300px;
  }
</style>
