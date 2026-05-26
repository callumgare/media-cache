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
import type { z } from "zod";
import type VideoMinimalSkin from "~/components/VideoMinimalSkin.vue";

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
</script>
