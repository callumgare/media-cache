import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";

/**
 * Makes drawing-tablet pen input behave like a mouse in PhotoSwipe.
 *
 * PhotoSwipe treats `pointerType === "pen"` the same as touch, which means
 * single-pointer dragging (e.g. panning a zoomed image) doesn't work. This
 * plugin intercepts pen PointerEvents at the window capture phase and
 * re-dispatches them with `pointerType: "mouse"` so PhotoSwipe handles them
 * as normal mouse drags.
 */
export class PhotoSwipePenAsMousePlugin {
  constructor(lightbox: PhotoSwipeLightbox) {
    lightbox.on("init", () => {
      const pswp = lightbox.pswp;
      if (!pswp) throw new Error("pswp not initialised");
      this.initPswp(pswp);
    });
  }

  private initPswp(pswp: PhotoSwipe) {
    let redispatching = false;

    function reDispatchAsMouse(e: PointerEvent) {
      if (e.pointerType !== "pen") return;
      if (redispatching) return;
      if (!e.target) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      redispatching = true;
      const mouseEvent = new PointerEvent(e.type, {
        pointerId: e.pointerId,
        width: e.width,
        height: e.height,
        pressure: e.pressure,
        tangentialPressure: e.tangentialPressure,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        twist: e.twist,
        pointerType: "mouse",
        isPrimary: e.isPrimary,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        movementX: e.movementX,
        movementY: e.movementY,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        button: e.button,
        buttons: e.buttons,
        relatedTarget: e.relatedTarget,
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        composed: e.composed,
      });
      e.target.dispatchEvent(mouseEvent);
      redispatching = false;
    }

    const TYPES = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ] as const;

    for (const type of TYPES) {
      window.addEventListener(type, reDispatchAsMouse as EventListener, {
        capture: true,
      });
    }

    pswp.on("destroy", () => {
      for (const type of TYPES) {
        window.removeEventListener(type, reDispatchAsMouse as EventListener, {
          capture: true,
        });
      }
    });
  }
}
