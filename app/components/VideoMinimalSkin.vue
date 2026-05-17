<template>
  <media-container ref="containerRef" class="media-minimal-skin media-minimal-skin--video">
    <slot />

    <media-poster></media-poster>

    <media-buffering-indicator class="media-buffering-indicator">
      <!-- spinner -->
      <svg class="media-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><rect width="2" height="5" x="8" y=".5" opacity=".5" rx="1"><animate attributeName="opacity" begin="0s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="12.243" y="2.257" opacity=".45" rx="1" transform="rotate(45 13.243 4.757)"><animate attributeName="opacity" begin="0.125s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="12.5" y="8" opacity=".4" rx="1"><animate attributeName="opacity" begin="0.25s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="10.743" y="12.243" opacity=".35" rx="1" transform="rotate(45 13.243 13.243)"><animate attributeName="opacity" begin="0.375s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="8" y="12.5" opacity=".3" rx="1"><animate attributeName="opacity" begin="0.5s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="3.757" y="10.743" opacity=".25" rx="1" transform="rotate(45 4.757 13.243)"><animate attributeName="opacity" begin="0.625s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x=".5" y="8" opacity=".15" rx="1"><animate attributeName="opacity" begin="0.75s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="2.257" y="3.757" opacity=".1" rx="1" transform="rotate(45 4.757 4.757)"><animate attributeName="opacity" begin="0.875s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect></svg>
    </media-buffering-indicator>

    <media-error-dialog class="media-error">
      <div class="media-error__dialog">
        <div class="media-error__content">
          <media-alert-dialog-title class="media-error__title">Something went wrong.</media-alert-dialog-title>
          <media-alert-dialog-description class="media-error__description"></media-alert-dialog-description>
        </div>
        <div class="media-error__actions">
          <media-alert-dialog-close class="media-button media-button--primary">OK</media-alert-dialog-close>
        </div>
      </div>
    </media-error-dialog>

    <!-- Gesture zones: tap, hold, drag on left / middle / right thirds of the video -->
    <div class="gesture-overlay">
      <div
        v-if="rateLabel !== null"
        class="rate-indicator"
        data-testid="feed-slide-rate-indicator"
      >{{ rateLabel }}</div>
      <div
        class="zones"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointermove="onPointerMove"
        @pointercancel="onPointerCancel"
      >
        <div class="zone zone--left" />
        <div class="zone zone--middle">
          <div
            v-if="isPaused"
            class="play-icon"
            data-testid="feed-slide-play-icon"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <div class="zone zone--right" />
      </div>
    </div>

    <media-controls class="media-controls">
      <media-tooltip-group>
        <div class="media-time-controls">
          <media-time-slider class="media-slider">
            <media-slider-track class="media-slider__track">
              <media-slider-fill class="media-slider__fill"></media-slider-fill>
              <media-slider-buffer class="media-slider__buffer"></media-slider-buffer>
            </media-slider-track>
            <media-slider-thumb class="media-slider__thumb"></media-slider-thumb>

            <div class="media-preview media-slider__preview">
              <div class="media-preview__thumbnail-wrapper">
                <media-slider-thumbnail class="media-preview__thumbnail"></media-slider-thumbnail>
              </div>
              <media-slider-value type="pointer" class="media-time media-preview__time"></media-slider-value>
              <!-- preview spinner -->
              <svg class="media-preview__spinner media-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" aria-hidden="true" viewBox="0 0 18 18"><rect width="2" height="5" x="8" y=".5" opacity=".5" rx="1"><animate attributeName="opacity" begin="0s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="12.243" y="2.257" opacity=".45" rx="1" transform="rotate(45 13.243 4.757)"><animate attributeName="opacity" begin="0.125s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="12.5" y="8" opacity=".4" rx="1"><animate attributeName="opacity" begin="0.25s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="10.743" y="12.243" opacity=".35" rx="1" transform="rotate(45 13.243 13.243)"><animate attributeName="opacity" begin="0.375s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="8" y="12.5" opacity=".3" rx="1"><animate attributeName="opacity" begin="0.5s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="2" height="5" x="3.757" y="10.743" opacity=".25" rx="1" transform="rotate(45 4.757 13.243)"><animate attributeName="opacity" begin="0.625s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x=".5" y="8" opacity=".15" rx="1"><animate attributeName="opacity" begin="0.75s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect><rect width="5" height="2" x="2.257" y="3.757" opacity=".1" rx="1" transform="rotate(45 4.757 4.757)"><animate attributeName="opacity" begin="0.875s" calcMode="linear" dur="1s" repeatCount="indefinite" values="1;0"/></rect></svg>
            </div>
          </media-time-slider>

          <media-time-group class="media-time-group">
            <media-time type="current" class="media-time media-time--current"></media-time>
            <media-time-separator class="media-time-separator"></media-time-separator>
            <media-time type="duration" class="media-time media-time--duration"></media-time>
          </media-time-group>
        </div>
      </media-tooltip-group>
    </media-controls>

    <div class="media-overlay"></div>
  </media-container>
</template>

<script setup lang="ts">
const instance = getCurrentInstance();
const id = `vjs-${instance?.uid ?? Math.random().toString(36).slice(2)}`;

const containerRef = ref<HTMLElement | null>(null);
const {
  isPaused,
  rateLabel,
  onPointerDown,
  onPointerUp,
  onPointerMove,
  onPointerCancel,
  seekForward,
  seekBackward,
  startFastForward,
  startRewind,
  stopFastSeek,
  togglePlayPause,
} = useVideoZoneGestures(containerRef);

defineExpose({
  seekForward,
  seekBackward,
  startFastForward,
  startRewind,
  stopFastSeek,
  togglePlayPause,
});
</script>

<style scoped>
/* ── Gesture overlay ──────────────────────────────────── */
.gesture-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.zones {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: auto;
}

.zone {
  flex: 1;
  height: 100%;
  position: relative;
}

/* ── Rate indicator ────────────────────────────────────── */
.rate-indicator {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}

/* ── Play icon ─────────────────────────────────────────── */
.play-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72px;
  height: 72px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: transform 0.12s ease;
  color: rgba(255, 255, 255, 0.9);
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
}

.zone--middle:hover .play-icon {
  transform: translate(-50%, -50%) scale(1.2);
}

.play-icon svg {
  width: 100%;
  height: 100%;
}
</style>
