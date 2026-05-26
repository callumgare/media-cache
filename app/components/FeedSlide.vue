<template>
  <div
    class="feed-slide"
    :class="{ 'is-current': isCurrent, 'fill-screen': prefs.videoFit === 'cover', 'is-pinching': isPinching }"
    data-testid="feed-slide"
    :data-media-id="media.id"
    :data-current="isCurrent || undefined"
  >
    <!-- Media area -->
    <div
      ref="mediaAreaRef"
      class="media-area"
      data-testid="feed-slide-media-area"
      :data-natural-size="naturalSizeRef ? `${naturalSizeRef.width}x${naturalSizeRef.height}` : undefined"
    >
      <!-- Video -->
      <template v-if="isVideo && isNearby">
        <MediaPlayer
          ref="playerRef"
          :media="media"
          :loop="prefs.loopVideo"
          :muted="prefs.muteVideo"
          class="video-player-el media"
          data-testid="feed-slide-video-player"
          video-test-id="feed-slide-video"
          @loadedmetadata="onMetadataLoaded"
          @resize="onMediaResize"
          @ended="onEnded"
        />
      </template>

      <!-- Image (or video poster when not nearby) -->
      <img
        v-else-if="imageSrc"
        ref="imageRef"
        :src="imageSrc"
        class="media"
        alt=""
        data-testid="feed-slide-image"
        @load="onImageLoaded"
      />
    </div>

    <!-- Right-side action buttons -->
    <div class="action-buttons" data-testid="feed-slide-actions">
      <Button
        icon="pi pi-filter"
        rounded
        text
        class="action-btn"
        aria-label="Show filters"
        data-testid="feed-slide-filter-btn"
        @click="uiState.sidebarMobileCollapsed = false"
      />
      <Button
        icon="pi pi-sync"
        rounded
        text
        class="action-btn"
        :class="{ active: prefs.loopVideo }"
        aria-label="Toggle loop"
        data-testid="feed-slide-loop-btn"
        @click="prefs.set({ loopVideo: !prefs.loopVideo })"
      />
      <Button
        :icon="prefs.videoFit === 'cover' ? 'pi pi-search-plus' : 'pi pi-search-minus'"
        rounded
        text
        class="action-btn"
        :class="{ active: isZoomActive }"
        aria-label="Toggle zoom"
        data-testid="feed-slide-fill-screen-btn"
        @click="onZoomButtonClick"
      />
      <Button
        :icon="prefs.muteVideo ? 'pi pi-volume-off' : 'pi pi-volume-up'"
        rounded
        text
        class="action-btn"
        :class="{ active: !prefs.muteVideo }"
        aria-label="Toggle mute"
        data-testid="feed-slide-mute-btn"
        @click="prefs.set({ muteVideo: !prefs.muteVideo })"
      />
      <Button
        icon="pi pi-info-circle"
        rounded
        text
        class="action-btn"
        :class="{ active: infoOpen }"
        aria-label="Show info"
        data-testid="feed-slide-info-btn"
        @click="infoOpen = !infoOpen"
      />
      <Button
        :icon="isFullscreen ? 'pi pi-compress' : 'pi pi-expand'"
        rounded
        text
        class="action-btn"
        :class="{ active: isFullscreen }"
        aria-label="Toggle fullscreen"
        data-testid="feed-slide-fullscreen-btn"
        @click="toggleFullscreen"
      />
    </div>

    <!-- Info overlay -->
    <Transition name="fade">
      <div v-if="infoOpen" class="info-overlay" data-testid="feed-slide-info-overlay">
        <MediaInfo :media="media" />
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import { useUserPreferences } from "@@/stores/user-preferences";
import type { APIMedia } from "@@/types/api-media";
import type { z } from "zod";
import type MediaPlayer from "~/components/MediaPlayer.vue";

const props = defineProps<{
  media: z.infer<typeof APIMedia>;
  isCurrent: boolean;
  isNearby: boolean;
}>();

const emit = defineEmits<(e: "ended") => void>();

// ─── User preferences ──────────────────────────────────────────────────────

const prefs = useUserPreferences();
prefs.init();

const uiState = useUiState();

// ─── Media file resolution ─────────────────────────────────────────────────

const videoFile = computed(() =>
  props.media.files.find((f) => f.hasVideo && f.ext !== "gif"),
);
const imageFile = computed(() =>
  props.media.files.find((f) => f.hasImage || f.ext === "gif"),
);
const isVideo = computed(() => !!videoFile.value);

function fileSrc(type: string, filename: string) {
  return `/file/${props.media.id}/${type}/${filename}`;
}

// Poster/thumbnail used for the <img> fallback when the video isn't nearby.
const imageSrc = computed(() => {
  if (imageFile.value)
    return fileSrc(imageFile.value.type, imageFile.value.filename);
  if (videoFile.value)
    return `/file/poster/${props.media.id}/${videoFile.value.type}/400`;
  return null;
});

// ─── Player ref ────────────────────────────────────────────────────────────

const playerRef = ref<InstanceType<typeof MediaPlayer> | null>(null);

// ─── Pinch-to-zoom ────────────────────────────────────────────────────────

const mediaAreaRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

/**
 * The element Panzoom is applied to. Set after the media has loaded so we
 * know its natural dimensions and have the right element reference.
 */
const mediaElementRef = ref<Element | null>(null);

/** Natural intrinsic dimensions of the current media item. */
const naturalSizeRef = ref<{ width: number; height: number } | null>(null);

const { isPinching, syncZoom, availableLevels } = useFeedZoom(
  mediaAreaRef,
  mediaElementRef,
  naturalSizeRef,
  {
    getZoomLevel: () =>
      prefs.videoFit as import("~/composables/useFeedZoom").ZoomLevel,
    onSnap: (level) => prefs.set({ videoFit: level }),
  },
);

// The zoom button is "active" (highlighted) when NOT in fill-screen (cover) mode.
// This matches the original two-state toggle behaviour: inactive = cover, active = zoomed out.
const isZoomActive = computed(() => prefs.videoFit !== "cover");

// Cycle to the next zoom level on button click.
function onZoomButtonClick() {
  const levels = availableLevels();
  const currentIdx = levels.indexOf(
    prefs.videoFit as import("~/composables/useFeedZoom").ZoomLevel,
  );
  const nextIdx = (Math.max(0, currentIdx) + 1) % levels.length;
  prefs.set({ videoFit: levels[nextIdx] });
}

// Animate the zoom when the user toggles via the button (not from a pinch).
watch(
  () => prefs.videoFit,
  () => syncZoom(true),
);

// Reset media state when the slide swaps out.
watch(
  () => [props.isNearby, props.media.id] as const,
  () => {
    mediaElementRef.value = null;
    naturalSizeRef.value = null;
  },
);

// ─── Video controls registration ──────────────────────────────────────────

const { register, unregisterById } = useCurrentVideoControls();
const controlsId = Symbol();

watch(
  () => [props.isCurrent, playerRef.value] as const,
  ([current, player]) => {
    if (current && player) {
      register(controlsId, {
        seekForward: () => player.seekForward(),
        seekBackward: () => player.seekBackward(),
        startFastForward: () => player.startFastForward(),
        startRewind: () => player.startRewind(),
        stopFastSeek: () => player.stopFastSeek(),
        togglePlayPause: () => player.togglePlayPause(),
      });
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  unregisterById(controlsId);
});

// ─── Play / pause driven by isCurrent ─────────────────────────────────────

watch(
  () => props.isCurrent,
  (current) => {
    if (current) {
      playerRef.value?.play()?.catch(() => {});
    } else {
      playerRef.value?.pause();
    }
  },
);

// ─── Fullscreen ───────────────────────────────────────────────────────────

const isFullscreen = ref(false);

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

onMounted(() => {
  document.addEventListener("fullscreenchange", onFullscreenChange);
});

onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
});

// ─── Info panel ───────────────────────────────────────────────────────────

const infoOpen = ref(false);

watch(
  () => props.isCurrent,
  (current) => {
    if (!current) {
      infoOpen.value = false;
      loopCount.value = 0;
    }
  },
);

// ─── Short-video auto-loop ────────────────────────────────────────────────
// If the user hasn't enabled looping, short videos are automatically
// re-played as long as adding another loop won't exceed 6 seconds total.

const MAX_LOOP_DURATION = 4; // seconds

const videoDuration = ref<number>(Number.NaN);
const loopCount = ref(0);

function onMetadataLoaded() {
  videoDuration.value = playerRef.value?.duration ?? Number.NaN;

  // Capture natural dimensions from the actual loaded video.
  const w = playerRef.value?.videoWidth ?? 0;
  const h = playerRef.value?.videoHeight ?? 0;
  if (w > 0 && h > 0) naturalSizeRef.value = { width: w, height: h };

  // Wire up Panzoom to the real media element now that we know its size.
  mediaElementRef.value = playerRef.value?.mediaElement ?? null;

  // Auto-play if this is already the current slide when metadata loads
  if (props.isCurrent) {
    playerRef.value?.play()?.catch(() => {});
  }
}

/**
 * Called when the video's intrinsic dimensions change (e.g. after the first HLS
 * segment loads on a custom <hls-video> element that doesn't expose videoWidth
 * directly at loadedmetadata time).  Re-reads the dimensions so the zoom levels
 * are computed correctly.
 */
function onMediaResize() {
  const w = playerRef.value?.videoWidth ?? 0;
  const h = playerRef.value?.videoHeight ?? 0;
  if (w > 0 && h > 0) naturalSizeRef.value = { width: w, height: h };
}

function onImageLoaded() {
  const img = imageRef.value;
  if (!img) return;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w > 0 && h > 0) naturalSizeRef.value = { width: w, height: h };
  mediaElementRef.value = img;
}

function onEnded() {
  const duration = videoDuration.value;
  if (
    !prefs.loopVideo &&
    !Number.isNaN(duration) &&
    (loopCount.value + 2) * duration <= MAX_LOOP_DURATION
  ) {
    loopCount.value++;
    playerRef.value?.restart()?.catch(() => {});
  } else {
    loopCount.value = 0;
    emit("ended");
  }
}
</script>

<style scoped>
.feed-slide {
  height: 100%;
  width: 100%;
  background: #000;
  overflow: hidden;

  &.is-pinching {
    overflow: visible;
  }
  transition: filter 0.4s ease;
  filter: brightness(0.6);
}

.feed-slide.is-current {
  filter: brightness(1);
}

/* Media area fills the slide */
.media-area {
  position: absolute;
  inset: 0;
}

/* Panzoom manages transform on the media element directly via inline style.
   Keep object-fit: contain always — zoom levels are expressed as scale(). */
.media-area > img,
.media-area :deep(video),
.media-area :deep(hls-video),
.media-area :deep(dash-video) {
  transform-origin: center center;
  /* hls-video and dash-video have display:contents by default (from @videojs/html),
     which makes CSS transforms have no visual effect. Override to block so Panzoom works.
     width/height:100% ensures the element fills its container so the transform-origin
     is at the container's centre (required for correct centering at all zoom levels). */
  display: block;
  width: 100%;
  height: 100%;
}

/* video-player custom element */
.video-player-el {
  width: 100%;
  height: 100%;
  display: block;
}

.media {
  width: 100%;
  height: 100%;

  /* Always contain — Panzoom's scale(coverRatio) visually fills the screen. */
  &,
  & :deep(video),
  & :deep(hls-video::part(video)),
  & :deep(dash-video::part(video)) {
    object-fit: contain;
    display: block;
  }
}

/* video.js custom element resets */
.feed-slide :deep(video-player) {
  width: 100%;
  height: 100%;
  display: block;
  --media-border-radius: 0;
}

/* Ejected minimal skin container */
.feed-slide :deep(media-container.media-minimal-skin) {
  width: 100%;
  height: 100%;
  display: block;
  --media-border-radius: 0;
}

/* ── Right-side action button stack ───────────────────────────── */
.action-buttons {
  position: absolute;
  right: calc(0.75rem + env(safe-area-inset-right));
  bottom: calc(4rem + (100lvh - 100dvh) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.3s;
}

.feed-slide.is-current .action-buttons {
  opacity: 1;
}

.action-btn {
  color: #fff !important;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  width: 2.5rem !important;
  height: 2.5rem !important;
}

.action-btn.active {
  color: var(--p-primary-color) !important;
}

/* ── Info overlay ──────────────────────────────────────────────── */
.info-overlay {
  position: absolute;
  bottom: calc(4rem + (100lvh - 100dvh) + env(safe-area-inset-bottom));
  left: calc(1rem + env(safe-area-inset-left));
  right: calc(4rem + env(safe-area-inset-right));
  z-index: 10;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 0.5rem;
  backdrop-filter: blur(4px);
  max-height: 50vh;
  overflow: auto;
}

.info-title {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
}

.info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.info-tag {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.15);
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}

/* MediaInfo inside the overlay — light-on-dark overrides */
.info-overlay :deep(.media-title) {
  color: #fff;
  font-size: 1rem;
}

.info-overlay :deep(.media-description),
.info-overlay :deep(.fields),
.info-overlay :deep(dt),
.info-overlay :deep(dd),
.info-overlay :deep(p) {
  color: rgba(255, 255, 255, 0.85);
}

.info-overlay :deep(a) {
  color: var(--p-primary-color);
}

.info-overlay :deep(.tag) {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.15);
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}

.info-overlay :deep(.section-heading) {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── Bottom offset for mobile browser chrome ────────────────── */
.feed-slide :deep(.media-controls) {
  padding-bottom: calc(100lvh - 100dvh + env(safe-area-inset-bottom));
}

/* ── Transitions ─────────────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
