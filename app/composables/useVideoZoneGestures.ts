import type { Ref } from "vue";

/**
 * Three-zone gesture controls for a video player.
 *
 * Zones are equal thirds of the element width:
 *   left   – seek backward 10 s on tap; rewind on hold
 *   middle – toggle play/pause on tap
 *   right  – seek forward 10 s on tap; fast-forward on hold
 *
 * While holding (>250 ms), dragging adjusts the seek speed.
 *
 * @param containerRef  Ref to the element that wraps the <video>.
 *                      The composable queries it for the first <video> child.
 * @returns Reactive `isPaused` / `rateLabel` state plus pointer-event handlers
 *          to bind on the zones element.
 */
export function useVideoZoneGestures(containerRef: Ref<HTMLElement | null>) {
  // ── Reactive UI state ────────────────────────────────────────────────────
  const isPaused = ref(true);
  const rateLabel = ref<string | null>(null);

  // ── Internal video ref ───────────────────────────────────────────────────
  const videoEl = ref<HTMLVideoElement | null>(null);

  // ── Constants ────────────────────────────────────────────────────────────
  const HOLD_THRESHOLD_MS = 250;
  const SEEK_SECONDS = 10;
  const TICK_MS = 100;
  // Horizontal movement threshold (pixels) beyond which the hold timer is
  // cancelled — the user is swiping to open the sidebar, not holding.
  const HORIZONTAL_DRAG_CANCEL_THRESHOLD = 10;

  // ── Gesture mutable state (not reactive – avoids overhead on pointer moves)
  let gestureZone: "left" | "middle" | "right" | null = null;
  let pointerDownX = 0;
  let pointerDownWidth = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let seekInterval: ReturnType<typeof setInterval> | null = null;
  let initialPaused = false;
  let dragStartX = 0;
  let isHolding = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────
  let removePlayListener: (() => void) | null = null;
  let removePauseListener: (() => void) | null = null;

  onMounted(async () => {
    await nextTick();
    const video = containerRef.value?.querySelector<HTMLVideoElement>(
      "video, hls-video, dash-video",
    );
    if (!video) {
      console.warn("useVideoZoneGestures: no video element found in container");
      return;
    }
    videoEl.value = video;
    isPaused.value = video.paused;
    const onPlay = () => {
      isPaused.value = false;
    };
    const onPause = () => {
      isPaused.value = true;
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    removePlayListener = () => video.removeEventListener("play", onPlay);
    removePauseListener = () => video.removeEventListener("pause", onPause);
  });

  onUnmounted(() => {
    cleanupGesture();
    removePlayListener?.();
    removePauseListener?.();
  });

  // ── Zone helper ──────────────────────────────────────────────────────────
  function getZone(x: number, width: number): "left" | "middle" | "right" {
    const f = x / width;
    return f < 1 / 3 ? "left" : f > 2 / 3 ? "right" : "middle";
  }

  // ── Tap actions ──────────────────────────────────────────────────────────
  function seekForward() {
    const v = videoEl.value;
    if (!v) return;
    const dur = v.duration;
    v.currentTime = Math.min(
      v.currentTime + SEEK_SECONDS,
      Number.isFinite(dur) ? dur : v.currentTime,
    );
  }

  function seekBackward() {
    const v = videoEl.value;
    if (!v) return;
    v.currentTime = Math.max(v.currentTime - SEEK_SECONDS, 0);
  }

  // ── Rate formatting ──────────────────────────────────────────────────────
  function formatRate(rate: number): string {
    const abs = Math.abs(rate);
    const sign = rate < 0 ? "\u2212" : "";
    if (abs < 10) {
      const str = abs % 1 === 0 ? `${abs}` : abs.toFixed(1);
      return `${sign}${str}x`;
    }
    const m = Math.floor(abs / 60);
    const s = Math.round(abs % 60);
    const parts = [m ? `${m}m` : "", s ? `${s}s` : ""]
      .filter(Boolean)
      .join(" ");
    return `${sign}${parts}`;
  }

  // ── Seek interval (rewind & very-high forward rates) ─────────────────────
  function clearSeekInterval() {
    if (seekInterval !== null) {
      clearInterval(seekInterval);
      seekInterval = null;
    }
  }

  function startSeekInterval(rate: number) {
    clearSeekInterval();
    seekInterval = setInterval(() => {
      const v = videoEl.value;
      if (!v) return;
      const dur = Number.isFinite(v.duration)
        ? v.duration
        : Number.POSITIVE_INFINITY;
      v.currentTime = Math.max(
        0,
        Math.min(v.currentTime + rate * (TICK_MS / 1000), dur),
      );
    }, TICK_MS);
  }

  // ── Apply a seek rate (positive = forward, negative = rewind) ────────────
  function applySeekRate(rate: number) {
    const v = videoEl.value;
    if (!v) return;
    rateLabel.value = formatRate(rate);
    if (rate >= 0.1 && rate < 10) {
      clearSeekInterval();
      v.playbackRate = rate;
      if (v.paused) v.play().catch(() => {});
    } else {
      v.pause();
      v.playbackRate = 1;
      startSeekInterval(rate);
    }
  }

  // ── Hold start / stop ────────────────────────────────────────────────────
  function startHold() {
    const v = videoEl.value;
    if (!v) return;
    initialPaused = v.paused;
    dragStartX = pointerDownX;
    applySeekRate(gestureZone === "right" ? 1.5 : -1.5);
  }

  function stopHold() {
    clearSeekInterval();
    const v = videoEl.value;
    if (v) {
      v.playbackRate = 1;
      if (initialPaused) {
        v.pause();
      } else {
        v.play().catch(() => {});
      }
    }
    rateLabel.value = null;
  }

  // ── Keyboard fast-seek (exposed for global keyboard handler) ─────────────
  let keyboardFastSeekInitialPaused = false;

  function startFastForward() {
    const v = videoEl.value;
    if (!v) return;
    keyboardFastSeekInitialPaused = v.paused;
    applySeekRate(1.5);
  }

  function startRewind() {
    const v = videoEl.value;
    if (!v) return;
    keyboardFastSeekInitialPaused = v.paused;
    applySeekRate(-1.5);
  }

  function stopFastSeek() {
    clearSeekInterval();
    const v = videoEl.value;
    if (v) {
      v.playbackRate = 1;
      if (keyboardFastSeekInitialPaused) {
        v.pause();
      } else {
        v.play().catch(() => {});
      }
    }
    rateLabel.value = null;
  }

  function cleanupGesture() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (isHolding) stopHold();
    else clearSeekInterval();
    gestureZone = null;
    isHolding = false;
  }

  // ── Pointer event handlers ───────────────────────────────────────────────
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    // A non-primary pointer means a second touch has arrived (e.g. the start of
    // a pinch gesture).  Cancel any pending hold immediately so the rate
    // indicator never appears during a pinch-to-zoom interaction.
    if (!event.isPrimary) {
      cleanupGesture();
      return;
    }
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    pointerDownX = event.clientX - rect.left;
    pointerDownWidth = rect.width;
    gestureZone = getZone(pointerDownX, pointerDownWidth);
    isHolding = false;
    el.setPointerCapture(event.pointerId);
    holdTimer = setTimeout(() => {
      holdTimer = null;
      isHolding = true;
      startHold();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp(_event: PointerEvent) {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
      const v = videoEl.value;
      if (v) {
        switch (gestureZone) {
          case "left":
            seekBackward();
            break;
          case "middle":
            v.paused ? v.play().catch(() => {}) : v.pause();
            break;
          case "right":
            seekForward();
            break;
        }
      }
    } else if (isHolding) {
      stopHold();
    }
    gestureZone = null;
    isHolding = false;
  }

  function onPointerMove(event: PointerEvent) {
    if (!isHolding) {
      // Cancel the hold timer when the pointer has moved significantly in the
      // horizontal direction before the hold threshold fires.  This prevents
      // the video speed gesture from activating when the user is swiping to
      // open the filter sidebar.
      if (holdTimer !== null) {
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        if (
          Math.abs(currentX - pointerDownX) > HORIZONTAL_DRAG_CANCEL_THRESHOLD
        ) {
          cleanupGesture();
        }
      }
      return;
    }
    // Hold is active: consume the pointermove so the sidebar drag handler
    // (bound to the parent container) never receives it.  This prevents a
    // horizontal drag from opening / closing the sidebar while fast-forward
    // or rewind is in progress.
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const offsetX = currentX - dragStartX;
    const baseRate = gestureZone === "right" ? 1.5 : -1.5;
    const rate = Math.max(
      -30,
      Math.min(30, baseRate + (offsetX / pointerDownWidth) * 5),
    );
    applySeekRate(rate);
  }

  function onPointerCancel() {
    cleanupGesture();
  }

  // On iOS @vueuse/gesture runs in touch-event mode, so the sidebar drag
  // listens to touchmove rather than pointermove.  Stopping propagation on
  // pointermove alone has no effect there; we must also stop the touchmove.
  function onTouchMove(event: TouchEvent) {
    if (isHolding) {
      event.stopPropagation();
    }
  }

  // When two or more fingers are on screen this is a pinch gesture.  Cancel
  // any pending hold or active hold so the rate indicator never appears and
  // the tap action is not triggered when the pinch ends.
  function onTouchStart(event: TouchEvent) {
    if (event.touches.length >= 2) {
      cleanupGesture();
    }
  }

  function togglePlayPause() {
    const v = videoEl.value;
    if (v) v.paused ? v.play().catch(() => {}) : v.pause();
  }

  return {
    isPaused,
    rateLabel,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onTouchMove,
    onTouchStart,
    seekForward,
    seekBackward,
    startFastForward,
    startRewind,
    stopFastSeek,
    togglePlayPause,
  };
}
