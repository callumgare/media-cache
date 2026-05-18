import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";
import { createApp, defineComponent, h, onMounted, ref as vueRef } from "vue";
import MediaPlayer from "~/components/MediaPlayer.vue";

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
  #playerRefs = new WeakMap<
    HTMLElement,
    import("vue").Ref<InstanceType<typeof MediaPlayer> | null>
  >();

  #initLightboxEvents(lightbox: PhotoSwipeLightbox) {
    lightbox.on("contentLoad", (e) => {
      if (!isVideoContent(e.content)) return;
      e.preventDefault();

      const content = e.content;
      if (content.element) return;

      content.state = "loading";

      const mediaData = content.data.mediaData as
        | import("@@/types/api-media").APIMediaData
        | undefined;
      if (!mediaData) {
        content.onLoaded();
        return;
      }

      const posterSrc = content.data.msrc;

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:absolute;left:0;top:0;";

      const loop = vueRef(false);
      const playerRef = vueRef<InstanceType<typeof MediaPlayer> | null>(null);

      // Prefer the server-supplied hasAudio flag from the media API; fall back
      // to the audioTracks browser API if the slide data doesn't include it.
      const hasAudioFromMetadata =
        mediaData.files.find((f) => f.hasVideo && f.ext !== "gif")?.hasAudio ??
        null;

      const app = createApp(
        defineComponent({
          setup() {
            onMounted(() => {
              // Stop the controls from showing when first opening. If the user
              // is active after the first second then let them show.
              const playerEl = wrapper.querySelector("video-player") as
                | (Element & {
                    store?: {
                      controlsVisible: boolean;
                      toggleControls: () => void;
                      subscribe: (cb: () => void) => void;
                    };
                  })
                | null;
              if (playerEl?.store) {
                const store = playerEl.store;
                let suppressVisible = true;
                setTimeout(() => {
                  suppressVisible = false;
                }, 1000);
                store.subscribe(() => {
                  if (store.controlsVisible && suppressVisible) {
                    store.toggleControls();
                  }
                });
              }
            });

            return () =>
              h(MediaPlayer, {
                ref: playerRef,
                media: mediaData,
                loop: loop.value,
                onLoadedmetadata: () => {
                  const player = playerRef.value;
                  if (!player) return;

                  // Auto-loop short videos.
                  const hasAudio =
                    hasAudioFromMetadata ??
                    (player.audioTracks?.length ?? 0) > 0;
                  if (player.duration < (hasAudio ? 5 : 10)) {
                    loop.value = true;
                  }

                  // Update slide dimensions from the video's actual metadata so
                  // PhotoSwipe can immediately center the content. Without this,
                  // HLS videos (whose DB file records have no pre-computed
                  // width/height) rely solely on the poster image loading, which
                  // requires a server-side ffmpeg extraction and can take seconds.
                  if (!content.data.width && !content.data.height) {
                    const w = player.videoWidth;
                    const h = player.videoHeight;
                    if (w && h) {
                      content.data.width = w;
                      content.data.height = h;
                      content.width = w;
                      content.height = h;
                      if (content.slide) {
                        content.slide.width = w;
                        content.slide.height = h;
                        content.slide.currZoomLevel =
                          content.slide.zoomLevels.initial;
                        content.slide.resize();
                      }
                      lightbox.pswp?.updateSize(true);
                    }
                  }
                },
              });
          },
        }),
      );

      app.mount(wrapper);
      this.#skinApps.set(wrapper, app);
      this.#playerRefs.set(wrapper, playerRef);
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
        this.#playerRefs.delete(content.element);
      }
    });

    lightbox.on("contentActivate", ({ content }) => {
      if (!isVideoContent(content)) return;
      if (content.element) {
        this.#playerRefs
          .get(content.element)
          ?.value?.play()
          ?.catch(() => {
            // Autoplay may be blocked by browser policy — ignore silently
          });
      }
    });

    lightbox.on("contentDeactivate", ({ content }) => {
      if (!isVideoContent(content)) return;
      if (content.element) {
        this.#playerRefs.get(content.element)?.value?.pause();
      }
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

      if (content.element) {
        this.#playerRefs.get(content.element)?.value?.pause();
      }
    });
  }
}
