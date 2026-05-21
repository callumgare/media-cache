<script setup lang="ts">
import type { APIMedia } from "@@/types/api-media";
import type { z } from "zod";
import useSlideData from "~/lib/useSlideData";

const props = defineProps<{
  medias: z.infer<typeof APIMedia>[];
  loadingCount?: number;
  total?: number;
}>();

const emit = defineEmits<{
  change: [value: { newIndex: number }];
}>();

const mediasRef = computed(() => props.medias);
const slideData = useSlideData(mediasRef);
const mediaSwipeOpen = useMediaSwipeOpen();

function openInSlideShow(media: z.infer<typeof APIMedia>) {
  const slideIndex = slideData.value.findIndex(
    (slide) => slide.mediaData?.id === media.id,
  );
  if (slideIndex === -1) {
    console.error(`Failed to get index for media: ${media.id}`);
    return;
  }
  mediaSwipeOpen(slideIndex);
}
</script>

<template>
  <MediaSwipe
    :slides="slideData"
    :total="total"
    @change="emit('change', $event)"
  />
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
        @media-click="openInSlideShow(media)"
      />
    </li>
    <li
      v-for="i in (loadingCount ?? 0)"
      :key="`loading-${i}`"
      class="item loading-placeholder"
    >
      <Skeleton class="loading-skeleton" />
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

  .loading-placeholder {
    width: 300px;
    height: 300px;
  }

  .loading-skeleton {
    width: 100% !important;
    height: 100% !important;
  }
</style>
