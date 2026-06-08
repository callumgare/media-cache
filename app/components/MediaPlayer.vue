<template>
  <!-- Attrs (class, data-testid, …) fall through to the video-player element. -->
  <video-player v-bind="$attrs">
    <VideoMinimalSkin ref="skinRef">
      <component
        :is="mediaTag"
        ref="videoRef"
        playsinline
        :src="videoSrc ?? undefined"
        :poster="posterSrc ?? undefined"
        :preload="preload"
        :loop="loop"
        :muted="muted"
        :data-testid="videoTestId"
        @loadedmetadata="emit('loadedmetadata')"
        @resize="emit('resize')"
        @ended="emit('ended')"
      />
    </VideoMinimalSkin>
  </video-player>
</template>

<script setup lang="ts">
import type { APIMedia } from "@@/types/api-media";
import { watchOnce } from "@vueuse/core";
import type { z } from "zod";
import type VideoMinimalSkin from "~/components/VideoMinimalSkin.vue";
import { useUiState } from "~~/stores/ui";
import { useUserPreferences } from "~~/stores/user-preferences";

defineOptions({ inheritAttrs: false });

// Maps file extensions to the appropriate adaptive-streaming custom element.
// hls-video uses hls.js on Chrome/Firefox and native HLS on Safari.
// dash-video uses dash.js on Chrome/Firefox and native DASH on Safari.
// All other formats fall back to a plain <video> element.
const ADAPTIVE_MEDIA_TAGS: Record<string, string> = {
  m3u8: "hls-video",
  mpd: "dash-video",
};

const props = withDefaults(
  defineProps<{
    media: z.infer<typeof APIMedia>;
    loop?: boolean;
    muted?: boolean;
    preload?: string;
    /** Forwarded as data-testid on the inner media element. */
    videoTestId?: string;
  }>(),
  {
    loop: false,
    muted: false,
    preload: "metadata",
    videoTestId: undefined,
  },
);

const emit = defineEmits<{
  (e: "loadedmetadata"): void;
  (e: "resize"): void;
  (e: "ended"): void;
}>();

const userPrefs = useUserPreferences();
const ui = useUiState();

// ── Source resolution ────────────────────────────────────────────────────────

const videoFile = computed(() =>
  props.media.files.find((f) => f.hasVideo && f.ext !== "gif"),
);
const imageFile = computed(() =>
  props.media.files.find((f) => f.hasImage || f.ext === "gif"),
);

function fileSrc(type: string, filename: string) {
  return `/file/${props.media.id}/${type}/${filename}`;
}

const videoSrc = computed(() =>
  videoFile.value
    ? fileSrc(videoFile.value.type, videoFile.value.filename)
    : null,
);

const posterSrc = computed(() => {
  if (imageFile.value)
    return fileSrc(imageFile.value.type, imageFile.value.filename);
  if (videoFile.value)
    return `/file/poster/${props.media.id}/${videoFile.value.type}/400`;
  return null;
});

// ── Media element selection ──────────────────────────────────────────────────

const mediaTag = computed(
  () => ADAPTIVE_MEDIA_TAGS[videoFile.value?.ext ?? ""] ?? "video",
);

// ── Refs ─────────────────────────────────────────────────────────────────────

const videoRef = ref<HTMLVideoElement | null>(null);
const skinRef = ref<InstanceType<typeof VideoMinimalSkin> | null>(null);

// ── Public API ───────────────────────────────────────────────────────────────

defineExpose({
  play: () => videoRef.value?.play(),
  pause: () => videoRef.value?.pause(),
  restart: () => {
    if (videoRef.value) {
      videoRef.value.currentTime = 0;
      return videoRef.value.play();
    }
  },
  seekForward: () => skinRef.value?.seekForward(),
  seekBackward: () => skinRef.value?.seekBackward(),
  startFastForward: () => skinRef.value?.startFastForward(),
  startRewind: () => skinRef.value?.startRewind(),
  stopFastSeek: () => skinRef.value?.stopFastSeek(),
  togglePlayPause: () => skinRef.value?.togglePlayPause(),
  get duration() {
    return videoRef.value?.duration ?? Number.NaN;
  },
  get videoWidth() {
    const directWidth = videoRef.value?.videoWidth ?? 0;
    if (directWidth > 0) return directWidth;
    // Custom media elements (e.g. hls-video) don't expose videoWidth directly;
    // fall back to the native <video> inside the shadow DOM.
    const inner = (
      videoRef.value as unknown as Element | null
    )?.shadowRoot?.querySelector("video");
    return inner instanceof HTMLVideoElement ? inner.videoWidth : 0;
  },
  get videoHeight() {
    const directHeight = videoRef.value?.videoHeight ?? 0;
    if (directHeight > 0) return directHeight;
    const inner = (
      videoRef.value as unknown as Element | null
    )?.shadowRoot?.querySelector("video");
    return inner instanceof HTMLVideoElement ? inner.videoHeight : 0;
  },
  get audioTracks() {
    return videoRef.value?.audioTracks;
  },
  /** The raw media element (video / hls-video / dash-video) for external use such as CSS transforms. */
  get mediaElement(): Element | null {
    return (videoRef.value as unknown as Element | null) ?? null;
  },
});

// ── Seeking ───────────────────────────────────────────────────────────────
type SeekPosition =
  | number
  | (({ videoElm }: { videoElm: HTMLVideoElement }) => number | null);
const queuedSeekPosition = ref<SeekPosition | null>(null);
function seekWhenReady(position: SeekPosition) {
  queuedSeekPosition.value = position;

  function seek() {
    if (!videoRef.value) {
      return;
    }
    const position =
      typeof queuedSeekPosition.value === "function"
        ? queuedSeekPosition.value({ videoElm: videoRef.value })
        : queuedSeekPosition.value;
    if (position !== null) {
      videoRef.value.currentTime = position;
      queuedSeekPosition.value = null;
    }
  }

  function whenDomRendered() {
    if (!videoRef.value) {
      console.warn("Video ref not available when trying to seek");
      return;
    }
    if (videoRef.value.readyState >= 1) {
      seek();
    } else {
      videoRef.value.addEventListener("loadedmetadata", seek, { once: true });
    }
  }

  if (videoRef.value) {
    whenDomRendered();
  } else {
    watchOnce(videoRef, whenDomRendered);
  }
}

// ── Start Position ───────────────────────────────────────────────────────────────
watch(
  () => (userPrefs._initialized ? userPrefs.videoStartPosition : null),
  (newPos) => {
    if (!newPos) return;
    if (newPos === "random") {
      seekWhenReady(({ videoElm }) => {
        // Avoid start and end 5% of scene
        const min = videoElm.duration * 0.05;
        const max = videoElm.duration * 0.95;
        const randomPoint = Math.floor(Math.random() * (max - min) + min);
        if (ui.debugMode) {
          console.log(
            `Seeking to random position ${randomPoint}s (duration: ${videoElm.duration}s)`,
          );
        }
        return randomPoint;
      });
    } else {
      newPos satisfies "start";
    }
  },
  { immediate: true },
);

// ── Cleanup ───────────────────────────────────────────────────────────────
onBeforeUnmount(() => {
  if (!videoRef.value) return;
  // Simply removing the video element from the page doesn't seem to cause the browser to immediately close any open requests that
  // are fetching the video. The user might flick though many videos quickly so we'd rather close immediately. We can do that by
  // clearing the src value before we unmount the element which seems to cause the browser to drop the connection and free up
  // resources faster.
  videoRef.value.src = "";
});
</script>
