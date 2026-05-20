<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import type { z } from "zod";

import type { APIMedia, APIMediaFile } from "@@/types/api-media";

type File = z.infer<typeof APIMediaFile>;

const props = defineProps<{
  media: z.infer<typeof APIMedia>;
}>();

const emits =
  defineEmits<(e: "mediaClick", value: z.infer<typeof APIMedia>) => void>();

const maxHeight = computed(() =>
  Math.max(...props.media.files.map((file) => file.height || 0)),
);

const thumbnailDisplayHeight = 300;
const fileSortWeight = (file: File) => {
  // Bias towards media that is closest to display height
  let weight = file.height
    ? Math.abs(file.height - thumbnailDisplayHeight) /
      Math.max(maxHeight.value, thumbnailDisplayHeight)
    : 1;
  if (!file.hasVideo) weight += 1;
  return weight;
};
const uiState = useUiState();

const files = computed(() =>
  props.media.files.toSorted((a, b) => fileSortWeight(a) - fileSortWeight(b)),
);

const displayElement = computed(() => {
  if (files.value.some((file) => file.hasVideo && file.ext === "m3u8")) {
    return "hls-video";
  }
  if (files.value.some((file) => file.hasVideo && file.ext !== "gif")) {
    return "video";
  }
  return "image";
});
const videoFile = computed(() =>
  files.value.find((file) => file.hasVideo && file.ext !== "gif"),
);
const imageFile = computed(() =>
  files.value.find((file) => file.hasImage || file.ext === "gif"),
);

const getSrc = (file: File) =>
  `${document.location.origin}/file/${props.media.id}/${file?.type}/${file.filename}`;

const posterSrc = computed(() => {
  if (imageFile.value) {
    return getSrc(imageFile.value);
  }
  if (videoFile.value) {
    return `${document.location.origin}/file/poster/${props.media.id}/${videoFile.value?.type}/${thumbnailDisplayHeight}`;
  }

  return "";
});

const videoRef = ref<HTMLVideoElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const naturalSizeLoaded = ref(false);

function onMediaLoaded() {
  naturalSizeLoaded.value = true;
}

onMounted(() => {
  // @load / @loadedmetadata won't fire for already-cached media
  if (imgRef.value?.complete) naturalSizeLoaded.value = true;
  if (videoRef.value && videoRef.value.readyState >= 1) {
    naturalSizeLoaded.value = true;
  }

  // For images/GIFs: browsers set natural dimensions from the file header
  // (a few bytes) long before the full file loads. ResizeObserver fires as
  // soon as the element renders at non-zero size, which happens at that point.
  if (imgRef.value && !imgRef.value.complete) {
    const observer = new ResizeObserver(() => {
      if (imgRef.value && imgRef.value.naturalWidth > 0) {
        onMediaLoaded();
        observer.disconnect();
      }
    });
    observer.observe(imgRef.value);
    onUnmounted(() => observer.disconnect());
  }

  // Treat the video poster as a proxy for "something visible has loaded"
  if (videoRef.value && posterSrc.value) {
    const posterImg = new Image();
    posterImg.onload = onMediaLoaded;
    posterImg.onerror = () => {
      console.warn("Failed to load poster image");
    };
    posterImg.src = posterSrc.value;
    if (posterImg.complete) {
      naturalSizeLoaded.value = true;
    }
  }
});

const hoverOverPlayCountdown = ref<NodeJS.Timeout | null>(null);
function handleMouseEnter() {
  // Due to the way <hls-video /> bridges events to the inner <video> mouseover events fire twice, so we disregard if
  // there's already a pending countdown to play the video.
  if (hoverOverPlayCountdown.value !== null) return;
  // We add a delay to avoid starting to play and then immediately pausing lots of videos if the user quickly moves the cursor across the page
  hoverOverPlayCountdown.value = setTimeout(() => {
    videoRef.value?.play();
  }, 500);
}
function handleMouseLeave() {
  if (hoverOverPlayCountdown.value) clearTimeout(hoverOverPlayCountdown.value);
  videoRef.value?.pause();
  hoverOverPlayCountdown.value = null;
}
</script>

<template>
  <div
    v-if="videoFile || imageFile"
    class="media-preview"
    :class="{ 'size-placeholder': !naturalSizeLoaded }"
  >
    <Skeleton v-if="!naturalSizeLoaded" class="media-loading-skeleton" />
    <details v-if="uiState.debugMode">
      <summary>Details</summary>
      <pre>{{ JSON.stringify(media, null, 2) }}</pre>
    </details>
    <a
      v-if="uiState.debugMode"
      :href="(videoFile && getSrc(videoFile)) || (imageFile && getSrc(imageFile)) || ''"
    >
      File Link
    </a>
    <component
      v-if="displayElement.endsWith('video')"
      :is="displayElement"
      :src="videoFile ? getSrc(videoFile) : ''"
      ref="videoRef"
      :poster="posterSrc"
      preload="none"
      playsinline="true"
      muted="true"
      :loop="true"
      @loadedmetadata="onMediaLoaded"
      @click.prevent="(event: Event) => { handleMouseLeave(); emits('mediaClick', media) }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    />
    <img
      v-else-if="displayElement === 'image'"
      ref="imgRef"
      :src="imageFile ? getSrc(imageFile) : ''"
      @load="onMediaLoaded"
      @click.prevent="emits('mediaClick', media)"
    >
    <div v-else>
      Unknown display type {{ displayElement }}
    </div>
  </div>
  <div v-else>
    <details v-if="uiState.debugMode">
      <summary>Details</summary>
      <pre>{{ JSON.stringify(media, null, 2) }}</pre>
    </details>
    file not valid
  </div>
</template>

<style scoped>
  .media-preview {
    position: relative;

    --play-button-size: 70px;

    &.size-placeholder {
      width: 300px;
      height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .media-loading-skeleton {
      /* !important is required to override the inline styles added by the Skeleton component */
      width: 100% !important;
      height: 100% !important;
      position: absolute !important;
      z-index: -1;
    }

    img, video, hls-video::part(video), dash-video::part(video) {
      max-height: 300px;
      max-width: 100%;
      display: block;
    }

    .info {
      min-width: 100px;
      max-width: 200px;
    }

    a {
      display: block;

      pre {
        overflow: auto;
      }
    }


    &:has(video, hls-video, dash-video) {
      &::before, &::after {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        content: '';
        transition: opacity 0.1s, transform 0.05s ease-in;
      }

      &::before {
        color: white;
        background-color: rgb(0 0 0 / 60%); /* Semi-transparent dark background */
        border-radius: 50%; /* Circular shape */
        pointer-events: none; /* Ensures button does not interfere with video controls */

        --circle-diameter: var(--play-button-size);

        width: var(--circle-diameter);
        height: var(--circle-diameter);
        line-height: var(--circle-diameter);
        display: block;
      }

      &::after {
        border-color: transparent transparent transparent white;
        will-change: border-width;
        border-style: solid;

        --height: calc(var(--play-button-size) * 0.437);
        --width: calc(var(--height) * 0.8);

        margin-left: calc(var(--width) * 0.15);
        border-width: calc(var(--height) * 0.5) 0 calc(var(--height) * 0.5) var(--width);
      }

      /* Hover effect: Slightly grow the play button */
      &:hover::before, &:hover::after {
        transition: opacity 1s 0.5s;
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.05); /* Scale the play button */
      }
    }

  }

</style>
