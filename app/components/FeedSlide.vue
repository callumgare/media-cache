<template>
  <div
    class="feed-slide"
    :class="{ 'is-current': isCurrent, 'fill-screen': prefs.videoFit === 'cover' }"
    data-testid="feed-slide"
    :data-media-id="media.id"
    :data-current="isCurrent || undefined"
  >
    <!-- Media area -->
    <div
      class="media-area"
      data-testid="feed-slide-media-area"
    >
      <!-- Video -->
      <template v-if="isVideo && isNearby">
        <MediaPlayer
          ref="playerRef"
          :media="media"
          :loop="prefs.loopVideo"
          :muted="prefs.muteVideo"
          class="video-player-el"
          data-testid="feed-slide-video-player"
          video-test-id="feed-slide-video"
          @loadedmetadata="onMetadataLoaded"
          @ended="onEnded"
        />
      </template>

      <!-- Image (or video poster when not nearby) -->
      <img
        v-else-if="imageSrc"
        :src="imageSrc"
        class="media-image"
        alt=""
        data-testid="feed-slide-image"
      />
    </div>

    <!-- Right-side action buttons -->
    <div class="action-buttons" data-testid="feed-slide-actions">
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
        :class="{ active: prefs.videoFit === 'contain' }"
        aria-label="Toggle zoom"
        data-testid="feed-slide-fill-screen-btn"
        @click="prefs.set({ videoFit: prefs.videoFit === 'cover' ? 'contain' : 'cover' })"
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
  // Auto-play if this is already the current slide when metadata loads
  if (props.isCurrent) {
    playerRef.value?.play()?.catch(() => {});
  }
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

/* video-player custom element */
.video-player-el {
  width: 100%;
  height: 100%;
  display: block;
}

.media-video,
.media-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.feed-slide.fill-screen .media-video,
.feed-slide.fill-screen .media-image {
  object-fit: cover;
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
  right: 0.75rem;
  bottom: 4rem;
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
  bottom: 4rem;
  left: 1rem;
  right: 4rem;
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
