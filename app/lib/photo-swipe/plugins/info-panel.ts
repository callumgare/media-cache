import type { APIMediaData } from "@@/types/api-media";
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";
import { useInfoPanel } from "~/composables/useInfoPanel";

type SlideWithMedia = NonNullable<PhotoSwipe["currSlide"]> & {
  data: { mediaData?: APIMediaData };
};

/**
 * Build an SVG string in the same format PhotoSwipe uses for its built-in icons:
 * a 32×32 viewBox, an outline/shadow <use> referencing the path ID, then the path.
 */
function pswpSvg(pathD: string, id: string): string {
  return `<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><use class="pswp__icn-shadow" xlink:href="#${id}"/><path d="${pathD}" id="${id}"/></svg>`;
}

export class PhotoSwipeInfoPanelPlugin {
  private static styleInjected = false;

  private static injectStyles() {
    if (PhotoSwipeInfoPanelPlugin.styleInjected) return;
    PhotoSwipeInfoPanelPlugin.styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .pswp__info-panel {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        max-height: 50%;
        overflow-y: auto;
        background: rgb(0 0 0 / 85%);
        color: #fff;
        transform: translateY(100%);
        transition: transform 0.3s ease;
        border-radius: 12px 12px 0 0;
        padding: 16px;
        overscroll-behavior: none;
      }
      .pswp--info-no-transition .pswp__info-panel {
        transition: none;
      }
      .pswp--info-open .pswp__info-panel {
        transform: translateY(0);
      }
      .pswp__button--info-button svg {
        display: block;
      }
      .pswp__info-panel .pswp__button--info-close {
        position: static;
        display: block;
        width: 44px;
        height: 44px;
      }
    `;
    document.head.appendChild(style);
  }

  constructor(lightbox: PhotoSwipeLightbox) {
    PhotoSwipeInfoPanelPlugin.injectStyles();
    lightbox.on("init", () => {
      const pswp = lightbox.pswp;
      if (!pswp) throw new Error("pswp not initialised");
      this.initPswp(pswp);
    });
  }

  private initPswp(pswp: PhotoSwipe) {
    const { isOpen, currentMedia, panelEl, toggle, _registerSetOpen } =
      useInfoPanel();

    // Bottom padding (px) added to the PhotoSwipe pan area when the panel is open,
    // so the media is repositioned above the panel and shrunk if needed.
    let panelBottomPadding = 0;
    pswp.options.paddingFn = () => ({
      top: 0,
      bottom: panelBottomPadding,
      left: 0,
      right: 0,
    });

    // Smoothly animate the PhotoSwipe pan area padding to a new value, driving the
    // media into its new position without snapping. Cancels any in-progress animation.
    // Optional fromPanY: spring pan.y from the dragged position to where it should rest
    // after the padding change, so release-from-drag doesn't snap.
    // Target pan.y = clamp(fromPanY - targetPadding/2, finalBounds) — shifts image up
    // by half the panel height (clamped), keeping zoomed images in view.
    // We derive finalBounds by temporarily applying targetPadding and asking PhotoSwipe
    // directly, rather than replicating its bounds formula (which would risk subtle
    // mismatches that cause a snap at animation end).
    let resizeAnimRafId: number | null = null;
    function animatePanelResize(targetPadding: number, fromPanY?: number) {
      if (resizeAnimRafId !== null) cancelAnimationFrame(resizeAnimRafId);
      const startPadding = panelBottomPadding;
      if (startPadding === targetPadding && fromPanY === undefined) return;
      pswp.animations.stopAllPan();
      const startTime = performance.now();
      const duration = 300;

      // Determine toPanY using PhotoSwipe's own bounds (avoids replicating its maths).
      // Both updateSize calls are synchronous — no paint happens between them.
      let toPanY: number | undefined;
      if (fromPanY !== undefined) {
        const cs = pswp.currSlide;
        if (cs) {
          panelBottomPadding = targetPadding;
          pswp.updateSize(true);
          const desired = fromPanY - targetPadding / 2;
          toPanY = Math.min(
            cs.bounds.min.y,
            Math.max(cs.bounds.max.y, desired),
          );
          panelBottomPadding = startPadding;
          pswp.updateSize(true);
          cs.pan.y = fromPanY;
          cs.applyCurrentZoomPan();
        }
      }

      function frame(now: number) {
        // Kill any spring PhotoSwipe's _finishPanGestureForAxis added after our pointerUp
        // handler ran (it schedules after us, so our first frame wins the rAF queue).
        pswp.animations.stopAllPan();
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - t) ** 3; // ease-out cubic
        panelBottomPadding = Math.round(
          startPadding + (targetPadding - startPadding) * ease,
        );
        pswp.updateSize(true);
        if (fromPanY !== undefined && toPanY !== undefined) {
          const currSlide = pswp.currSlide;
          if (currSlide) {
            currSlide.pan.y = fromPanY + (toPanY - fromPanY) * ease;
            currSlide.applyCurrentZoomPan();
          }
        }
        if (t < 1) {
          resizeAnimRafId = requestAnimationFrame(frame);
        } else {
          resizeAnimRafId = null;
          panelBottomPadding = targetPadding;
          pswp.updateSize(true);
        }
      }
      resizeAnimRafId = requestAnimationFrame(frame);
    }

    // Animate currSlide.pan.y from fromY to toY over duration ms.
    function animateSlidePan(fromY: number, toY: number, duration = 300) {
      pswp.animations.stopAllPan();
      const startTime = performance.now();
      function frame(now: number) {
        // Same rAF-ordering trick: kill springs added by _finishPanGestureForAxis.
        pswp.animations.stopAllPan();
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - t) ** 3;
        const currSlide = pswp.currSlide;
        if (currSlide) {
          currSlide.pan.y = fromY + (toY - fromY) * ease;
          currSlide.applyCurrentZoomPan();
        }
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    // The plugin owns CSS class management on pswp.template, so it registers
    // itself as the setOpen handler so all calls from Vue components go through here.
    function setOpen(open: boolean, immediate = false) {
      isOpen.value = open;
      if (immediate) {
        pswp.template?.classList.add("pswp--info-no-transition");
        requestAnimationFrame(() =>
          pswp.template?.classList.remove("pswp--info-no-transition"),
        );
      }
      pswp.template?.classList.toggle("pswp--info-open", open);

      // Resize the pan area so the media sits above the panel (or restore full area).
      const targetPadding = open ? openPadding() : 0;
      if (immediate) {
        // Lightbox is closing — snap instantly, no animation needed.
        if (resizeAnimRafId !== null) cancelAnimationFrame(resizeAnimRafId);
        panelBottomPadding = targetPadding;
        pswp.updateSize(true);
      } else {
        animatePanelResize(targetPadding);
      }
    }
    _registerSetOpen(setOpen);

    // The padding to reserve at the bottom when the panel is open: the smaller of
    // half the viewport height (the CSS max-height cap) and the panel's actual height.
    function openPadding() {
      const half = Math.round(pswp.viewportSize.y * 0.5);
      const panelH = panelEl.value?.offsetHeight;
      return panelH !== undefined ? Math.min(half, panelH) : half;
    }

    // When the panel is open, Escape should close only the panel, not the lightbox.
    // Up arrow opens the panel; down arrow closes the panel (if open) or the lightbox.
    pswp.on("keydown", (e) => {
      const key = e.originalEvent.key;
      if (key === "Escape" && isOpen.value) {
        e.preventDefault();
        setOpen(false);
      } else if (key === "ArrowUp" && !isOpen.value) {
        e.preventDefault();
        setOpen(true);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        if (isOpen.value) {
          setOpen(false);
        } else {
          pswp.close();
        }
      }
    });

    // Prevent upward swipe from closing the lightbox.
    // We preventDefault and replicate PhotoSwipe's friction pan manually so the slide
    // still moves up. bgOpacity is kept >= 1 (darkened) which prevents
    // _finishPanGestureForAxis from triggering a close on release.
    // The panel is pulled into view at half the media's displacement in real time.
    const VERTICAL_DRAG_FRICTION = 0.6;
    let upwardDragActive = false;
    let downwardPanelDragActive = false;
    // Hoisted so verticalDrag can yield when the panel has captured the pointer.
    let panelIsDragging = false;
    // Count of currently active touch pointers — when > 1 a pinch is in progress.
    let numActivePointers = 0;
    // Ring buffer of (time, panY) samples during an upward drag, used to compute
    // velocity at release time. More reliable than pswp.gestures.velocity.y which
    // is stale at pointerUp dispatch.
    let upVelocityPoints: Array<{ t: number; panY: number }> = [];
    // Ring buffer for downward media drag velocity when the panel is open.
    let downVelocityPoints: Array<{ t: number; panY: number }> = [];
    // pan.y of the slide at the moment a downward media drag starts (panel open).
    let mediaDragOpenPanY = 0;
    pswp.on("verticalDrag", (e) => {
      // Ignore during pinch-to-zoom (more than one finger active).
      if (numActivePointers > 1) return;
      const currSlide = pswp.currSlide;
      if (!currSlide) return;
      const centerY = currSlide.bounds.center.y;

      if (e.panY < centerY) {
        // Only intercept if the image was already at its upper pan limit when the
        // touch started. Checking per-frame would let a drag that starts mid-image
        // eventually reach the limit and incorrectly trigger the panel.
        if (!ptrDownAtMinBound) return;

        // Upward drag — prevent close and pull panel into view.
        upwardDragActive = true;
        e.preventDefault();

        // Track samples for velocity calculation at release.
        upVelocityPoints.push({ t: performance.now(), panY: e.panY });
        if (upVelocityPoints.length > 10) upVelocityPoints.shift();

        // Replicate _setPanWithFriction('y', panY, VERTICAL_DRAG_FRICTION)
        const delta = e.panY - currSlide.pan.y;
        currSlide.pan.y += Math.round(delta * VERTICAL_DRAG_FRICTION);
        currSlide.applyCurrentZoomPan();

        // Darken backdrop proportional to drag distance.
        // bgOpacity > 1 ensures _finishPanGestureForAxis skips the close check.
        const viewportH = pswp.viewportSize.y;
        const upRatio = Math.min((centerY - e.panY) / (viewportH / 4), 1);
        pswp.applyBgOpacity(1 + upRatio * 0.15);

        // Pull panel into view at half the media's displacement.
        const el = panelEl.value;
        if (!el || isOpen.value) return;
        const mediaUpOffset = centerY - currSlide.pan.y;
        const panelH = el.offsetHeight;
        const panelTranslate = Math.max(0, panelH - mediaUpOffset * 0.5);
        el.style.transition = "none";
        el.style.transform = `translateY(${panelTranslate}px)`;
      } else if (isOpen.value) {
        // Only intercept if the image was already at its lower pan limit when the
        // touch started, for the same reason.
        if (!ptrDownAtMaxBound) return;

        // Downward drag while panel is open — prevent PhotoSwipe from closing the
        // lightbox, and push the panel down at 2× the media rate instead.
        e.preventDefault();
        if (!downwardPanelDragActive) {
          downwardPanelDragActive = true;
          mediaDragOpenPanY = currSlide.pan.y;
        }
        downVelocityPoints.push({ t: performance.now(), panY: e.panY });
        if (downVelocityPoints.length > 10) downVelocityPoints.shift();

        // Replicate PhotoSwipe's friction pan so the media moves with the drag.
        const delta = e.panY - currSlide.pan.y;
        currSlide.pan.y += Math.round(delta * VERTICAL_DRAG_FRICTION);
        currSlide.applyCurrentZoomPan();

        const el = panelEl.value;
        if (!el) return;
        const downOffset = Math.max(0, currSlide.pan.y - centerY);
        el.style.transition = "none";
        el.style.transform = `translateY(${downOffset * 2}px)`;
      }
    });

    // Track pointer-down position/time so quick flicks that don't generate
    // verticalDrag events can still be detected in pointerUp.
    // Also track whether the image was already at its upper pan limit at touch-start
    // (i.e. the bottom was visible), which is required for the fallback flick to open
    // the panel — we don't want a flick that started in the middle of a zoomed image
    // to trigger it.
    let ptrDownY = 0;
    let ptrDownTime = 0;
    let ptrDownAtMinBound = false;
    let ptrDownAtMaxBound = false;
    pswp.on("pointerDown", (e) => {
      if (e.originalEvent.pointerType === "mouse") return;
      numActivePointers++;
      // Reset drag state when a second finger joins (pinch started).
      if (numActivePointers > 1) {
        upwardDragActive = false;
        downwardPanelDragActive = false;
        upVelocityPoints = [];
        downVelocityPoints = [];
      }
      ptrDownY = e.originalEvent.clientY;
      ptrDownTime = performance.now();
      upVelocityPoints = [];
      downVelocityPoints = [];
      const cs = pswp.currSlide;
      // Record whether the image was at each pan limit at touch-start.
      // PhotoSwipe bounds are CSS-translation values: bounds.max.y is the most negative
      // (image panned as far up as possible, showing the BOTTOM), bounds.min.y is the
      // least negative (showing the TOP). So for an upward swipe to open the panel the
      // image must already be at bounds.max.y (bottom visible, nowhere left to pan up).
      // For a downward swipe to close the panel it must be at bounds.min.y (top visible).
      ptrDownAtMinBound = !cs || cs.pan.y <= cs.bounds.max.y + 1;
      ptrDownAtMaxBound = !cs || cs.pan.y >= cs.bounds.min.y - 1;
    });

    pswp.on("pointerUp", (e) => {
      if (e.originalEvent.pointerType !== "mouse")
        numActivePointers = Math.max(0, numActivePointers - 1);

      // On release: handle both upward and downward drag cases.
      if (upwardDragActive) {
        upwardDragActive = false;

        const el = panelEl.value;
        const currSlide = pswp.currSlide;
        const centerY = currSlide?.bounds.center.y ?? 0;
        // friction-adjusted offset (smaller than raw)
        const mediaUpOffset = currSlide ? centerY - currSlide.pan.y : 0;
        // Compute velocity from our own ring buffer (pswp.gestures.velocity.y is stale here).
        const recentVP = upVelocityPoints.filter(
          (p) => performance.now() - p.t < 150,
        );
        let velocityUp = 0;
        const vpFirst = recentVP[0];
        const vpLast = recentVP[recentVP.length - 1];
        if (vpFirst && vpLast && recentVP.length >= 2) {
          // panY decreases as finger moves up, so first.panY > last.panY → positive velocity
          velocityUp =
            (vpFirst.panY - vpLast.panY) / Math.max(1, vpLast.t - vpFirst.t);
        }
        upVelocityPoints = [];

        // Open if dragged far enough or fast enough.
        if (mediaUpOffset > 60 || velocityUp > 0.3) {
          // Capture displaced position before setOpen changes anything.
          const draggedPanY = currSlide?.pan.y ?? 0;
          // Replicate setOpen(true) state changes without calling animatePanelResize yet.
          isOpen.value = true;
          pswp.template?.classList.add("pswp--info-open");
          if (el) {
            el.style.transition = "";
            el.style.transform = "";
          }
          pswp.applyBgOpacity(1);
          // Spring media from its dragged position to the final clamped position.
          animatePanelResize(openPadding(), draggedPanY);
        } else {
          // Not enough — restore bgOpacity and spring panel back closed.
          pswp.applyBgOpacity(1);
          animateSlidePan(currSlide?.pan.y ?? centerY, centerY);
          if (el) {
            el.style.transition = "transform 0.3s ease";
            el.style.transform = "";
            setTimeout(() => {
              el.style.transition = "";
            }, 300);
          }
        }
      }

      if (downwardPanelDragActive) {
        downwardPanelDragActive = false;
        const el = panelEl.value;
        const currSlide = pswp.currSlide;
        const centerY = currSlide?.bounds.center.y ?? 0;
        // How far below center the media has been dragged (panel translation = 2×).
        const mediaDownOffset = currSlide ? currSlide.pan.y - centerY : 0;

        // Compute velocity from ring buffer (positive = downward).
        const recentDown = downVelocityPoints.filter(
          (p) => performance.now() - p.t < 150,
        );
        let velocityDown = 0;
        const dvFirst = recentDown[0];
        const dvLast = recentDown[recentDown.length - 1];
        if (dvFirst && dvLast && recentDown.length >= 2) {
          // panY increases as finger moves down → positive velocity
          velocityDown =
            (dvLast.panY - dvFirst.panY) / Math.max(1, dvLast.t - dvFirst.t);
        }
        downVelocityPoints = [];

        if (el && (mediaDownOffset * 2 > 60 || velocityDown > 0.5)) {
          // Far/fast enough — close the panel, spring media to unpaddled centre.
          el.style.transition = "transform 0.25s ease-out";
          el.style.transform = "translateY(100%)";
          const draggedPanY = currSlide?.pan.y ?? mediaDragOpenPanY;
          isOpen.value = false;
          if (resizeAnimRafId !== null) cancelAnimationFrame(resizeAnimRafId);
          pswp.template?.classList.remove("pswp--info-open");
          animatePanelResize(0, draggedPanY);
          setTimeout(() => {
            el.style.transition = "none";
            el.style.transform = "";
            requestAnimationFrame(() => {
              el.style.transition = "";
            });
          }, 250);
        } else if (el) {
          // Not far/fast enough — snap panel and media back to panel-open position.
          el.style.transition = "transform 0.3s ease";
          el.style.transform = "";
          if (currSlide) animateSlidePan(currSlide.pan.y, mediaDragOpenPanY);
          setTimeout(() => {
            el.style.transition = "";
          }, 300);
        }
      }

      // Fallback: catch quick upward flicks that were too fast to generate any
      // verticalDrag events (so upwardDragActive was never set). We detect these
      // purely from the start/end pointer positions and elapsed time.
      // Skip if a pinch was involved, or if the image wasn't at its upper pan limit
      // at touch-start (meaning there was still room to pan up).
      if (
        !upwardDragActive &&
        !isOpen.value &&
        numActivePointers === 0 &&
        ptrDownAtMinBound &&
        e.originalEvent.pointerType !== "mouse"
      ) {
        const dy = ptrDownY - e.originalEvent.clientY; // positive = moved upward
        const dt = performance.now() - ptrDownTime;
        const flickVelocity = dy / Math.max(1, dt); // px/ms upward
        if (flickVelocity > 0.3 && dy > 5) {
          const centerY = pswp.currSlide?.bounds.center.y ?? 0;
          const draggedPanY = pswp.currSlide?.pan.y ?? centerY;
          isOpen.value = true;
          pswp.template?.classList.add("pswp--info-open");
          if (panelEl.value) {
            panelEl.value.style.transition = "";
            panelEl.value.style.transform = "";
          }
          pswp.applyBgOpacity(1);
          animatePanelResize(openPadding(), draggedPanY);
        }
      }
    });

    pswp.on("uiRegister", () => {
      pswp.ui?.registerElement({
        name: "info-button",
        title: "Media info",
        order: 9,
        isButton: true,
        // Circled "i" — same isCustomSVG system as PhotoSwipe built-ins; outlineID adds shadow.
        // Solid filled circle (white via --pswp-icon-color) with dot and stem drawn on top
        // using fill="currentColor" (--pswp-icon-color-secondary, dark grey) to match the
        // solid + bars in the zoom icon.
        html: {
          isCustomSVG: true,
          inner:
            '<path d="M8 16a8 8 0 1 0 16 0 8 8 0 0 0-16 0z" id="pswp__icn-info"/><path fill="currentColor" d="M15 11.5h2v2h-2z"/><path fill="currentColor" d="M15 15h2v5h-2z"/>',
          outlineID: "pswp__icn-info",
        },
        onClick: () => toggle(),
      });
    });

    pswp.on("appendHeavy", () => {
      if (!panelEl.value && pswp.template) {
        const el = document.createElement("div");
        el.className = "pswp__info-panel";
        el.setAttribute("aria-label", "Media information");

        // Close button — pswp__button styling so it matches toolbar icons
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "pswp__button pswp__button--info-close";
        closeBtn.title = "Close";
        closeBtn.setAttribute("aria-label", "Close info panel");
        // Down-chevron path, same SVG system as PhotoSwipe built-ins
        closeBtn.innerHTML = pswpSvg(
          "M7 13l9 9 9-9-2-2-7 7-7-7z",
          "pswp__icn-info-close",
        );
        closeBtn.addEventListener("click", () => setOpen(false));
        el.appendChild(closeBtn);

        pswp.template.appendChild(el);
        panelEl.value = el;

        // ── Panel: drag-to-close when at scroll-top ─────────────────────────────
        // When the panel is open and its scroll position is at the top, a
        // downward drag physically moves the panel and, if released past the
        // distance threshold (60 px) or with enough velocity (0.5 px/ms), closes it.
        let panelDragStartY = 0;
        let panelDragStartSlideY = 0; // currSlide.pan.y when the panel drag started
        // panelIsDragging is declared in initPswp scope so verticalDrag can yield to it.
        let velocityPoints: Array<{ t: number; y: number }> = [];

        el.addEventListener(
          "pointerdown",
          (e: PointerEvent) => {
            if (e.pointerType === "mouse") return;
            panelDragStartY = e.clientY;
            panelDragStartSlideY = pswp.currSlide?.pan.y ?? 0;
            panelIsDragging = false;
            velocityPoints = [{ t: Date.now(), y: e.clientY }];
          },
          { passive: true },
        );

        // Not passive — calls e.preventDefault() to suppress iOS rubber band and
        // pull-to-refresh. Must fire before the browser acts on the touch.
        el.addEventListener("pointermove", (e: PointerEvent) => {
          if (e.pointerType === "mouse") return;
          velocityPoints.push({ t: Date.now(), y: e.clientY });
          if (velocityPoints.length > 10) velocityPoints.shift();

          if (el.scrollTop > 0) return; // panel is scrolled — let it scroll normally

          const dy = e.clientY - panelDragStartY; // positive = dragging down
          if (dy <= 0) return; // upward movement — not our gesture

          // Prevent rubber band / pull-to-refresh as early as possible (before 8px
          // threshold) so iOS doesn't trigger its own behaviour first.
          e.preventDefault();

          if (!panelIsDragging) {
            if (dy > 8) {
              panelIsDragging = true;
              el.setPointerCapture(e.pointerId);
            } else {
              return;
            }
          }
          el.style.transform = `translateY(${Math.max(0, dy)}px)`;
          el.style.transition = "none";

          // Move the media down at half the panel drag rate.
          const currSlide = pswp.currSlide;
          if (currSlide) {
            currSlide.pan.y = panelDragStartSlideY + dy * 0.5;
            currSlide.applyCurrentZoomPan();
          }
        });

        // Belt-and-suspenders for iOS Safari < 16: preventDefault on the underlying
        // touch event is the only reliable way to suppress pull-to-refresh on older iOS.
        // overscroll-behavior (above) handles iOS 16+.
        let touchStartY = 0;
        el.addEventListener(
          "touchstart",
          (e: TouchEvent) => {
            touchStartY = e.touches[0]?.clientY ?? 0;
          },
          { passive: true },
        );
        el.addEventListener(
          "touchmove",
          (e: TouchEvent) => {
            if (el.scrollTop > 0) return;
            const currentY = e.touches[0]?.clientY ?? touchStartY;
            if (currentY > touchStartY) e.preventDefault();
          },
          { passive: false },
        );

        el.addEventListener(
          "pointerup",
          (e: PointerEvent) => {
            if (e.pointerType === "mouse") return;
            if (!panelIsDragging) return;
            panelIsDragging = false;
            // Stop event reaching the template handler (which would misinterpret this
            // as a swipe gesture on the lightbox).
            e.stopPropagation();

            const dy = e.clientY - panelDragStartY;

            // Velocity: average over last 100 ms, in px/ms (positive = downward)
            const recent = velocityPoints.filter((p) => Date.now() - p.t < 100);
            let velocity = 0;
            const firstPoint = recent[0];
            const lastPoint = recent[recent.length - 1];
            if (firstPoint && lastPoint && recent.length >= 2) {
              velocity =
                (lastPoint.y - firstPoint.y) /
                Math.max(1, lastPoint.t - firstPoint.t);
            }

            if (dy > 60 || velocity > 0.5) {
              // Slide the panel out.
              el.style.transition = "transform 0.25s ease-out";
              el.style.transform = "translateY(100%)";
              // Capture the current (dragged) pan position so the spring starts from here.
              const draggedPanY = pswp.currSlide?.pan.y ?? panelDragStartSlideY;
              // Update state and spring the media back immediately — in parallel with the
              // panel CSS animation — so both finish at roughly the same time.
              isOpen.value = false;
              if (resizeAnimRafId !== null)
                cancelAnimationFrame(resizeAnimRafId);
              pswp.template?.classList.remove("pswp--info-open");
              animatePanelResize(0, draggedPanY);
              setTimeout(() => {
                // Panel slide-out done — clear inline styles without triggering a transition.
                el.style.transition = "none";
                el.style.transform = "";
                requestAnimationFrame(() => {
                  el.style.transition = "";
                });
              }, 250);
            } else {
              // Not far/fast enough — spring panel and media back to panel-open position.
              el.style.transition = "transform 0.3s ease";
              el.style.transform = "";
              animateSlidePan(
                pswp.currSlide?.pan.y ?? panelDragStartSlideY,
                panelDragStartSlideY,
              );
              setTimeout(() => {
                el.style.transition = "";
              }, 300);
            }
          },
          { passive: true },
        );

        el.addEventListener(
          "pointercancel",
          () => {
            if (!panelIsDragging) return;
            panelIsDragging = false;
            el.style.transform = "";
            el.style.transition = "";
            animateSlidePan(
              pswp.currSlide?.pan.y ?? panelDragStartSlideY,
              panelDragStartSlideY,
            );
          },
          { passive: true },
        );

        // Prevent wheel events from reaching PhotoSwipe (which would zoom the media)
        // when the pointer is over the panel — let the panel scroll normally instead.
        el.addEventListener("wheel", (e: WheelEvent) => {
          e.stopPropagation();
        });
      }
      currentMedia.value =
        (pswp.currSlide as SlideWithMedia | undefined)?.data?.mediaData ?? null;
    });

    pswp.on("change", () => {
      currentMedia.value =
        (pswp.currSlide as SlideWithMedia | undefined)?.data?.mediaData ?? null;
    });

    pswp.on("close", () => {
      setOpen(false, true);
    });

    function onResize() {
      if (!isOpen.value) return;
      panelBottomPadding = openPadding();
      pswp.updateSize(true);
    }
    window.addEventListener("resize", onResize);

    pswp.on("destroy", () => {
      window.removeEventListener("resize", onResize);
      _registerSetOpen(null);
      panelEl.value?.remove();
      panelEl.value = null;
      currentMedia.value = null;
      isOpen.value = false;
    });
  }
}
