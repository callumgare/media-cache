import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";

type Options = Record<never, never>;

function isVideoContent(
  content: { data?: { type?: unknown } } | null | undefined,
): boolean {
  return content?.data?.type === "video";
}

export class PhotoSwipeCustomVideoPlugin {
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
    this.options = options;
    this.#initLightboxEvents(lightbox);
    lightbox.on("init", () => {
      if (!lightbox.pswp) {
        throw Error("Failed to init");
      }
      this.#initPswpEvents(lightbox.pswp);
    });
  }

  options: Options;

  #initLightboxEvents(lightbox: PhotoSwipeLightbox) {
    lightbox.on("contentLoad", (e) => {
      if (!isVideoContent(e.content)) return;
      e.preventDefault();

      const content = e.content;
      if (content.element) return;

      content.state = "loading";

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:absolute;left:0;top:0;";

      const player = document.createElement("video-player");
      const skin = document.createElement("video-minimal-skin");
      // skin.classList.add("pswp__img");

      // Stop the controls from showing when first opening. If the user is active after the first second then let them show
      let suppressVisible = true;
      setTimeout(() => {
        suppressVisible = false;
      }, 1000);
      player.store.subscribe(() => {
        if (player.store.controlsVisible && suppressVisible) {
          player.store.toggleControls();
        }
      });

      const video = document.createElement("video");
      video.classList.add("pswp__img");
      video.style.height = "100%";
      video.style.width = "100%";
      video.setAttribute("playsinline", "");

      const videoSrc = content.data.videoSrc;
      if (videoSrc) {
        video.src = String(videoSrc);
      }

      const posterSrc = content.data.msrc;
      if (posterSrc) {
        video.poster = String(posterSrc);
      }

      skin.appendChild(video);
      player.appendChild(skin);
      wrapper.appendChild(player);

      content.element = wrapper;
      // content.element = player;

      // Signal loaded once poster is ready (or immediately if no poster)
      if (posterSrc) {
        const posterImg = new Image();
        posterImg.src = String(posterSrc);
        if (posterImg.complete) {
          content.onLoaded();
        } else {
          posterImg.onload = posterImg.onerror = () => content.onLoaded();
        }
      } else {
        content.onLoaded();
      }
    });

    lightbox.on("contentDestroy", ({ content }) => {
      if (!isVideoContent(content)) return;
      // Custom element cleanup is handled by disconnectedCallback
    });

    lightbox.on("contentActivate", ({ content }) => {
      if (!isVideoContent(content)) return;
      const video = content.element?.querySelector("video");
      video?.play().catch(() => {
        // Autoplay may be blocked by browser policy — ignore silently
      });
    });

    lightbox.on("contentDeactivate", ({ content }) => {
      if (!isVideoContent(content)) return;
      const video = content.element?.querySelector("video");
      video?.pause();
    });

    lightbox.on("contentAppend", (e) => {
      if (!isVideoContent(e.content)) return;
      e.preventDefault();
      e.content.isAttached = true;
      e.content.appendImage();
    });

    lightbox.on("contentResize", (e) => {
      if (!isVideoContent(e.content)) return;
      e.preventDefault();

      const { width, height, content } = e;

      if (content.element) {
        content.element.style.width = `${width}px`;
        content.element.style.height = `${height}px`;

        const skin =
          content.element.querySelector<HTMLElement>("video-minimal-skin");
        if (skin) {
          skin.style.width = `${width}px`;
          skin.style.height = `${height}px`;
        }
      }

      if (content.placeholder?.element) {
        const placeholderElStyle = content.placeholder.element.style;
        placeholderElStyle.transform = "none";
        placeholderElStyle.width = `${width}px`;
        placeholderElStyle.height = `${height}px`;
      }
    });

    lightbox.addFilter(
      "isKeepingPlaceholder",
      (isKeepingPlaceholder, content) => {
        if (isVideoContent(content)) return false;
        return isKeepingPlaceholder;
      },
    );

    lightbox.addFilter("isContentZoomable", (isContentZoomable, content) => {
      if (isVideoContent(content)) return true;
      return isContentZoomable;
    });

    lightbox.addFilter(
      "useContentPlaceholder",
      (useContentPlaceholder, content) => {
        if (isVideoContent(content)) return true;
        return useContentPlaceholder;
      },
    );
  }

  #initPswpEvents(pswp: PhotoSwipe) {
    // Don't zoom when clicking video controls — check composedPath for media-controls element
    pswp.on("imageClickAction", (e) => {
      if (!isVideoContent(pswp.currSlide?.content)) return;
      const isControlClick = e.originalEvent
        .composedPath()
        .some(
          (el) =>
            el instanceof Element &&
            el.tagName.toLowerCase() === "media-controls",
        );
      if (isControlClick) e.preventDefault();
    });

    pswp.on("close", () => {
      const content = pswp.currSlide?.content;
      if (!content || !isVideoContent(content)) return;

      // Use fade transition for closing video slides (zoom is choppy)
      if (
        !pswp.options.showHideAnimationType ||
        pswp.options.showHideAnimationType === "zoom"
      ) {
        pswp.options.showHideAnimationType = "fade";
      }

      const video = content.element?.querySelector("video");
      video?.pause();
    });
  }
}
