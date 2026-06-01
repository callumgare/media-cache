import { useFavourites } from "@@/stores/favourites";
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe } from "photoswipe/lightbox";
import { watch } from "vue";

/**
 * Adds a heart (favourite) button to the PhotoSwipe top bar.
 * State is shared with the rest of the UI via the favourites Pinia store.
 */
export class PhotoSwipeFavouritePlugin {
  private static styleInjected = false;

  private static injectStyles() {
    if (PhotoSwipeFavouritePlugin.styleInjected) return;
    PhotoSwipeFavouritePlugin.styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .pswp__button--favourite-button #pswp__icn-heart-fill {
        display: none;
      }
      .pswp__button--favourite-button.is-favourited {
        --pswp-icon-stroke-color: #932828;
      }
      .pswp__button--favourite-button.is-favourited #pswp__icn-heart-inner {
        display: none;
      }
      .pswp__button--favourite-button.is-favourited #pswp__icn-heart-fill {
        display: inline;
        fill: #e53e3e;
      }
    `;
    document.head.appendChild(style);
  }

  constructor(lightbox: PhotoSwipeLightbox) {
    PhotoSwipeFavouritePlugin.injectStyles();
    lightbox.on("init", () => {
      const pswp = lightbox.pswp;
      if (!pswp) throw new Error("pswp not initialised");
      this.initPswp(pswp);
    });
  }

  private initPswp(pswp: PhotoSwipe) {
    const favourites = useFavourites();
    let btnEl: HTMLElement | null = null;

    function currentMediaId(): number | undefined {
      const id = pswp.currSlide?.data.id;
      return typeof id === "number" ? id : undefined;
    }

    function updateButton() {
      if (!btnEl) return;
      const id = currentMediaId();
      const isFav = id !== undefined && favourites.isFavourited(id);
      btnEl.classList.toggle("is-favourited", isFav);
      const label = isFav ? "Remove from favourites" : "Add to favourites";
      btnEl.title = label;
      btnEl.setAttribute("aria-label", label);
    }

    pswp.on("uiRegister", () => {
      pswp.ui?.registerElement({
        name: "favourite-button",
        title: "Add to favourites",
        order: 8,
        isButton: true,
        html: {
          isCustomSVG: true,
          // outlineID references pswp__icn-heart-inner (the evenodd ring path) so
          // PhotoSwipe auto-inserts <use class="pswp__icn-shadow"> which traces the
          // filled ring with a dark stroke for visibility on bright backgrounds.
          // The ring is a fill-rule:evenodd compound path (outer heart - inner heart),
          // giving a uniform visual outline. pswp__icn-heart-fill is the solid red heart.
          inner:
            '<path id="pswp__icn-heart-inner" class="pswp__icn-heart-inner" fill-rule="evenodd" d="M19.596,11.06C20.8,11.1 21.624,11.986 21.6,13.054C21.9,16.488 16.576,20.06 16,20.51C15.448,20.036 10.1,16.488 10.4,13.054C10.376,11.986 11.1,11.2 12.404,11.06C13,10.996 13.805,11.395 14.3,11.8C15.4,12.7 16,13.9 16,13.9C16,13.9 16.4,13.2 17.6,12C18.053,11.547 18.954,11.039 19.596,11.06ZM19.6,8.66C18.11,8.66 16.796,9.402 16,10.535C15.204,9.402 13.89,8.66 12.4,8.66C9.97,8.66 8,10.63 8,13.06C8,17.636 13.2,21.41 16,23.34C18.8,21.41 24,17.636 24,13.06C24,10.63 22.03,8.66 19.6,8.66Z"/>' +
            '<path id="pswp__icn-heart-fill" d="M19.6,8.66C18.11,8.66 16.796,9.402 16,10.535C15.204,9.402 13.89,8.66 12.4,8.66C9.97,8.66 8,10.63 8,13.06C8,17.636 13.2,21.41 16,23.34C18.8,21.41 24,17.636 24,13.06C24,10.63 22.03,8.66 19.6,8.66Z"/>',
          outlineID: "pswp__icn-heart-inner",
        },
        onInit: (el) => {
          btnEl = el as HTMLElement;
          updateButton();
        },
        onClick: () => {
          const id = currentMediaId();
          if (id === undefined) return;
          favourites.toggle(id);
          updateButton();
        },
      });
    });

    pswp.on("change", () => updateButton());

    // React to external changes (e.g. from FeedSlide heart button)
    const stopWatch = watch(
      () => favourites.ids.slice(),
      () => updateButton(),
    );

    pswp.on("destroy", () => stopWatch());
  }
}
