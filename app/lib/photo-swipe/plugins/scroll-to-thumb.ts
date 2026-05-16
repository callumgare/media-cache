import type PhotoSwipeLightbox from "photoswipe/lightbox";

/**
 * When the PhotoSwipe gallery closes, scrolls the page to bring the current
 * slide's thumbnail into view if it is offscreen.
 */
export class PhotoSwipeScrollToThumbPlugin {
  constructor(lightbox: PhotoSwipeLightbox) {
    lightbox.on("close", () => {
      const pswp = lightbox.pswp;
      if (!pswp) return;

      const dataSource = lightbox.options.dataSource;
      if (!Array.isArray(dataSource)) return;

      const index = pswp.currIndex;
      const data = dataSource[index];
      if (!data) return;

      const thumbEl = lightbox.applyFilters("thumbEl", undefined, data, index);
      if (thumbEl) {
        thumbEl.scrollIntoView({ behavior: "instant", block: "nearest" });
      }
    });
  }
}
