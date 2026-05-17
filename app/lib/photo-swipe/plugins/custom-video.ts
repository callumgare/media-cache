import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";
import { createApp, h, ref as vueRef } from "vue";
import VideoMinimalSkin from "~/components/VideoMinimalSkin.vue";

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
  #skinApps = new WeakMap<HTMLElement, ReturnType<typeof createApp>>();

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

      const videoSrc = content.data.videoSrc;
      const posterSrc = content.data.msrc;

      // Prefer the server-supplied hasAudio flag from the media API; fall back
      // to the audioTracks browser API if the slide data doesn't include it.
      const mediaFile = (
        content.data.mediaData?.files as
          | import("@@/types/api-media").APIMediaData["files"]
          | undefined
      )?.find((f) => f.hasVideo && f.ext !== "gif");
      const hasAudioFromMetadata = mediaFile?.hasAudio ?? null;

      const videoRef = vueRef<HTMLVideoElement | null>(null);
      const app = createApp({
        render: () =>
          h(VideoMinimalSkin, null, {
            default: () =>
              h("video", {
                ref: videoRef,
                class: "pswp__img",
                style: "height:100%;width:100%",
                playsinline: "",
                ...(videoSrc ? { src: String(videoSrc) } : {}),
                ...(posterSrc ? { poster: String(posterSrc) } : {}),
                onLoadedmetadata: () => {
                  const video = videoRef.value;
                  if (!video) return;
                  const hasAudio =
                    hasAudioFromMetadata ??
                    (video.audioTracks?.length ?? 0) > 0;
                  if (video.duration < (hasAudio ? 5 : 10)) {
                    video.loop = true;
                  }
                },
              }),
          }),
      });
      app.mount(player);
      this.#skinApps.set(wrapper, app);

      wrapper.appendChild(player);
      content.element = wrapper;

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
      if (content.element) {
        this.#skinApps.get(content.element)?.unmount();
        this.#skinApps.delete(content.element);
      }
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

        const skin = content.element.querySelector<HTMLElement>(
          "media-container.media-minimal-skin",
        );
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
