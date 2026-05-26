import { useResizeObserver } from "@vueuse/core";
import { onMounted, onUnmounted, readonly, ref, watch } from "vue";
import type { Ref } from "vue";

/**
 * Manages pinch-to-zoom on the feed slide.
 *
 * Zoom levels are represented as CSS scale transforms on the media element:
 *   - natural: scale = 1/min(containerW/mediaW, containerH/mediaH)
 *              Media is shown at its actual pixel dimensions (1:1 CSS px).
 *              Only available when the media is smaller than the container.
 *   - contain: scale = 1  (media fits inside the container, object-fit:contain)
 *   - cover:   scale = max(cw,ch)/min(cw,ch)  (media fills the container)
 *
 * The available levels are computed at runtime from the actual loaded media
 * dimensions and the current container size — both can change independently.
 * The "natural" level appears only when the media's natural size is smaller
 * than what "contain" would show (i.e. naturalSizeScale < 1).
 *
 * During a pinch gesture the scale is unlimited — no clamping is applied.
 * When the gesture ends the scale snaps to the nearest preset level using a
 * directional threshold: spread ≥ 1.25× → advance one level up; pinch ≤ 0.8×
 * → retreat one level down; otherwise stay at current level.
 */

export type ZoomLevel = "natural" | "contain" | "cover";

/** Spread this much relative to start scale → advance one level up. */
const SNAP_OUT_RATIO = 1.25;
/** Pinch this much relative to start scale → retreat one level down. */
const SNAP_IN_RATIO = 0.8;

/** Duration in ms for animated zoom/pan transitions. */
const TRANSITION_DURATION = 200;
/** CSS easing for zoom/pan animations. */
const TRANSITION_EASING = "ease-out";

export interface UseFeedZoomOptions {
  /** Returns the current zoom preference. */
  getZoomLevel: () => ZoomLevel;
  /**
   * Called when the gesture ends and the snap target differs from the current
   * preference.  The caller should persist the new level.
   */
  onSnap: (level: ZoomLevel) => void;
}

export function useFeedZoom(
  /** Element that receives touch events for the pinch gesture. */
  touchTargetRef: Ref<HTMLElement | null>,
  /**
   * The element that receives CSS transforms.  Set to the video / img element once the
   * media has loaded; clear to null when it unmounts.
   *
   * IMPORTANT: dimensions must come from the actual loaded media
   * (videoWidth/videoHeight or naturalWidth/naturalHeight), not from DB
   * metadata, because many items have no stored size and the DB value may
   * differ from the rendered size.
   */
  mediaElementRef: Ref<Element | null>,
  /**
   * Intrinsic dimensions obtained from the loaded media element.
   * Null until the media fires loadedmetadata / load.
   */
  naturalSizeRef: Ref<{ width: number; height: number } | null>,
  options: UseFeedZoomOptions,
) {
  const isPinching = ref(false);

  let startDistance = 0;
  let startScale = 1;
  let currentScale = 1;
  /** Finger midpoint at gesture start (client/screen coordinates). */
  let startMidpoint = { x: 0, y: 0 };
  /**
   * The focal-point origin in client coordinates.
   * Equals the centre of the media element's parent container.
   * With `transform-origin: center center`, pan values (tx, ty) satisfy:
   *   screen_x = elementCenter.x + scale*(mediaX + tx)
   */
  let elementCenter = { x: 0, y: 0 };

  // ─── Scale computations ───────────────────────────────────────────────────
  // All computations use live container dimensions so they automatically
  // reflect viewport resizes without any extra wiring.

  function containerSize(): { w: number; h: number } | null {
    const c = touchTargetRef.value;
    if (!c) return null;
    const w = c.clientWidth;
    const h = c.clientHeight;
    return w && h ? { w, h } : null;
  }

  /** CSS scale at which the media covers the entire container. */
  function coverScale(): number {
    const cs = containerSize();
    const size = naturalSizeRef.value;
    if (!cs || !size?.width || !size?.height) return 1;
    const cw = cs.w / size.width;
    const ch = cs.h / size.height;
    return Math.max(cw, ch) / Math.min(cw, ch);
  }

  /**
   * CSS scale at which the media is shown at its natural pixel dimensions.
   * Returns a value < 1 when the media is smaller than the container (meaning
   * the "natural" zoom level is valid), or ≥ 1 when it is not.
   */
  function naturalScale(): number {
    const cs = containerSize();
    const size = naturalSizeRef.value;
    if (!cs || !size?.width || !size?.height) return 1;
    const minFit = Math.min(cs.w / size.width, cs.h / size.height);
    // minFit > 1  → container is larger than media → natural scale = 1/minFit < 1
    // minFit ≤ 1  → container is smaller → natural scale ≥ 1 (no separate level)
    return minFit > 0 ? 1 / minFit : 1;
  }

  /**
   * Returns the ordered list of zoom levels available for the current media
   * and viewport.  The "natural" level is included only when the media's
   * natural size is smaller than what "contain" renders (naturalScale < 1).
   */
  function availableLevels(): ZoomLevel[] {
    return naturalScale() < 0.98
      ? ["natural", "contain", "cover"]
      : ["contain", "cover"];
  }

  /** CSS scale for the given zoom level. */
  function scaleForLevel(level: ZoomLevel): number {
    switch (level) {
      case "natural":
        return naturalScale();
      case "contain":
        return 1;
      case "cover":
        return coverScale();
    }
  }

  // ─── Transform helpers ────────────────────────────────────────────────────

  /**
   * Apply a scale + translate transform to the media element.
   * `animate: true` plays a CSS transition; `false` snaps immediately.
   */
  function applyTransform(s: number, tx: number, ty: number, animate: boolean) {
    const el = mediaElementRef.value as HTMLElement | null;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${TRANSITION_DURATION}ms ${TRANSITION_EASING}`
      : "none";
    el.style.transform = `scale(${s}) translate(${tx}px, ${ty}px)`;
  }

  /**
   * Set up the media element for transforms and sync to the current zoom level.
   * Called whenever the media element is (re-)mounted.
   */
  function initTransform(el: Element) {
    const htmlEl = el as HTMLElement;
    htmlEl.style.transformOrigin = "center center";
    syncZoom(false);
  }

  /**
   * Sync the CSS transform to the current zoom preference.
   * Also handles the edge case where `videoFit === 'natural'` but the
   * natural level is no longer available (e.g. the viewport was resized).
   */
  function syncZoom(animated: boolean) {
    if (!mediaElementRef.value || isPinching.value) return;
    let level = options.getZoomLevel();
    const levels = availableLevels();
    // If the stored level doesn't exist in the current viewport (e.g. stored
    // 'natural' but viewport is now smaller than the media), fall back to
    // the smallest available level.
    if (!levels.includes(level)) {
      level = levels[0] ?? "contain";
      options.onSnap(level);
    }
    applyTransform(scaleForLevel(level), 0, 0, animated);
  }

  watch(
    mediaElementRef,
    (el) => {
      if (!el) return;
      initTransform(el);
    },
    { immediate: false },
  );

  // Re-sync when the natural size becomes known (media loaded).
  watch(naturalSizeRef, () => syncZoom(false));

  // Re-sync when the container is resized (viewport change).
  useResizeObserver(touchTargetRef, () => syncZoom(false));

  // ─── Gesture detection ────────────────────────────────────────────────────

  function getDistance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 2) return;

    // Prevent the browser's built-in pinch-zoom and stop the sidebar drag.
    event.preventDefault();
    event.stopPropagation();

    isPinching.value = true;

    // Snapshot the starting scale so the gesture feels seamless regardless
    // of which zoom level we began in.
    startScale = scaleForLevel(options.getZoomLevel());
    // Re-check available levels in case the viewport changed since last sync.
    if (!availableLevels().includes(options.getZoomLevel())) {
      startScale = scaleForLevel(availableLevels()[0] ?? "contain");
    }
    currentScale = startScale;

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    if (!t1 || !t2) return;
    startDistance = getDistance(t1, t2);

    // Record the finger midpoint so we can compute the focal-point pan in
    // onTouchMove.
    startMidpoint = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };

    // The focal-point origin – the reference point that pan values are relative
    // to – equals the centre of the element's parent container.  The touch
    // target fills the same area as that container, so its centre is the
    // correct value and avoids having to traverse the DOM to find the parent.
    const targetRect = touchTargetRef.value?.getBoundingClientRect();
    if (targetRect) {
      elementCenter = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      };
    }

    // Reset to exactly the current preference scale with pan (0, 0) — this
    // cancels any residual pan from a previous gesture and makes the
    // focal-point calculation below well-defined.
    applyTransform(startScale, 0, 0, false);
  }

  function onTouchMove(event: TouchEvent) {
    if (!isPinching.value) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.touches.length < 2 || !event.touches[0] || !event.touches[1])
      return;

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    const dist = getDistance(t1, t2);

    // No clamping — the user can zoom freely during the gesture.
    currentScale =
      startDistance > 0 ? startScale * (dist / startDistance) : startScale;

    // Current midpoint of the two fingers in client coordinates.
    const currentMidpoint = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };

    // Compute the pan (tx, ty) that simultaneously:
    //   a) keeps the initial pinch midpoint anchored to the same point in
    //      media-space (focal-point zoom), and
    //   b) pans the media by the drag delta of the midpoint.
    //
    // In the transform model — scale(s) translate(tx, ty) with
    // transform-origin at elementCenter — a screen position g maps to
    // media-space via: mediaX = (g.x - elementCenter.x) / s - tx
    //
    // Setting the same media point under the midpoint for start and current:
    //   tx = (currentMidpoint.x - elementCenter.x) / currentScale
    //      - (startMidpoint.x  - elementCenter.x) / startScale
    const tx =
      (currentMidpoint.x - elementCenter.x) / currentScale -
      (startMidpoint.x - elementCenter.x) / startScale;
    const ty =
      (currentMidpoint.y - elementCenter.y) / currentScale -
      (startMidpoint.y - elementCenter.y) / startScale;

    applyTransform(currentScale, tx, ty, false);
  }

  function finalizeGesture() {
    if (!isPinching.value) return;
    isPinching.value = false;

    const snapRatio = startScale > 0 ? currentScale / startScale : 1;
    const currentLevel = options.getZoomLevel();
    const levels = availableLevels();
    const currentIdx = levels.indexOf(currentLevel);
    // If the current level is somehow not in the list, default to the first.
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;

    let snapIdx = baseIdx;
    if (snapRatio >= SNAP_OUT_RATIO && baseIdx < levels.length - 1) {
      // Spread enough → advance one level up.
      snapIdx = baseIdx + 1;
    } else if (snapRatio <= SNAP_IN_RATIO && baseIdx > 0) {
      // Pinch enough → retreat one level down.
      snapIdx = baseIdx - 1;
    }

    const snapLevel = levels[snapIdx] ?? currentLevel;
    // Animate to the snap level, springing pan back to (0, 0) so the
    // media is always centred after a gesture.
    applyTransform(scaleForLevel(snapLevel), 0, 0, true);

    if (snapLevel !== currentLevel) {
      options.onSnap(snapLevel);
    }
  }

  function onTouchEnd(_event: TouchEvent) {
    finalizeGesture();
  }

  function onTouchCancel(_event: TouchEvent) {
    finalizeGesture();
  }

  onMounted(() => {
    const mediaEl = mediaElementRef.value;
    if (mediaEl) {
      initTransform(mediaEl);
    }

    const el = touchTargetRef.value;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
  });

  onUnmounted(() => {
    const el = touchTargetRef.value;
    if (el) {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    }
  });

  return {
    isPinching: readonly(isPinching),
    /**
     * Sync the CSS transform to the current zoom preference.
     * Pass `animated: true` when the change comes from a user button tap;
     * `false` on initial render or media swap.
     */
    syncZoom,
    /**
     * The available zoom levels for the current media and viewport.
     * Exposed so callers (e.g. FeedSlide) can build cycling UI without
     * duplicating the computation.
     */
    availableLevels,
  };
}
