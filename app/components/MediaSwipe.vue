<script setup lang="ts">
import PhotoSwipe from "photoswipe";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import "@videojs/html/video/minimal-skin.css";
import { useUiState } from "@@/stores/ui";
import { PhotoSwipeCustomVideoPlugin } from "~/lib/photo-swipe/plugins/custom-video";
import { PhotoSwipeCustomZoomPlugin } from "~/lib/photo-swipe/plugins/custom-zoom";
import { PhotoSwipeDebugPlugin } from "~/lib/photo-swipe/plugins/debug";
import { PhotoSwipeInfoPanelPlugin } from "~/lib/photo-swipe/plugins/info-panel";
import { PhotoSwipePenAsMousePlugin } from "~/lib/photo-swipe/plugins/pen-as-mouse";
import { PhotoSwipeScrollToThumbPlugin } from "~/lib/photo-swipe/plugins/scroll-to-thumb";
import { PhotoSwipeSizeOnLoadPlugin } from "~/lib/photo-swipe/plugins/size-on-load";

export type PhotoSwipeSlide = {
  id?: number;
  type?: string;
  src: string;
  videoSrc?: string;
  msrc?: string;
  mediaData?: import("@@/types/api-media").APIMediaData;
  [key: string]: unknown;
};

const props = defineProps<{
  slides: PhotoSwipeSlide[];
  total?: number;
}>();

const emit =
  defineEmits<
    (
      e: "change",
      value: {
        newIndex: number;
      },
    ) => void
  >();

const uiState = useUiState();

const photoSwipe = shallowRef<PhotoSwipeLightbox>();

watch(
  () => props.slides,
  (newSlides, oldSlides) => {
    if (photoSwipe.value) {
      const newSlidesMapped = newSlides.map(toRaw);
      const previousLength = oldSlides?.length ?? 0;
      const { dataSource } = photoSwipe.value.options;
      if (Array.isArray(dataSource)) {
        dataSource.splice(0, dataSource.length, ...newSlidesMapped);
      }
      // Refresh slides that now have data but previously had none because they
      // were beyond the loaded range. This re-renders any currently visible
      // blank slide that was waiting for its data to arrive.
      const pswp = photoSwipe.value.pswp;
      if (pswp) {
        for (let i = previousLength; i < newSlidesMapped.length; i++) {
          pswp.refreshSlideContent(i);
        }
      }
    }
  },
);

onMounted(() => {
  photoSwipe.value = new PhotoSwipeLightbox({
    dataSource: props.slides,
    pswpModule: PhotoSwipe,
    allowPanToNext: false, // prevent swiping to the next slide when image is zoomed
    wheelToZoom: true, // enable wheel-based zoom
    // close when backdrop is clicked
    tapAction: (point, event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.classList.contains("pswp__img")
      )
        return;
      photoSwipe.value?.pswp?.close();
    },
  });
  new PhotoSwipeCustomVideoPlugin(photoSwipe.value, {});
  new PhotoSwipeSizeOnLoadPlugin(photoSwipe.value, {});
  if (uiState.debugMode) {
    new PhotoSwipeDebugPlugin(photoSwipe.value);
  }
  new PhotoSwipeCustomZoomPlugin(photoSwipe.value);
  new PhotoSwipePenAsMousePlugin(photoSwipe.value);
  new PhotoSwipeInfoPanelPlugin(photoSwipe.value);
  new PhotoSwipeScrollToThumbPlugin(photoSwipe.value);

  photoSwipe.value.addFilter("itemData", (itemData) => {
    if (!itemData?.src && !itemData?.html) {
      return {
        html: '<div class="pswp-loading-placeholder"><i class="pi pi-spin pi-spinner"></i></div>',
      };
    }
    return itemData;
  });

  photoSwipe.value.addFilter("numItems", (numItems) => {
    return typeof props.total === "number" ? props.total : numItems;
  });

  photoSwipe.value.addFilter("thumbEl", (thumbEl, data) => {
    if (!data.id) {
      // Slide is for a media which hasn't loaded yet
      return undefined as unknown as HTMLElement;
    }
    const el = document.querySelector(
      `[data-media-id="${data.id}"] .media-thumbnail`,
    );
    if (el) {
      return el as HTMLElement;
    }
    if (thumbEl) {
      return thumbEl;
    }
    const errorMessage = `No thumb element found for slide with id ${data.id}`;
    if (uiState.debugMode) {
      console.info(thumbEl, data);
      throw Error(errorMessage);
    }
    console.error(errorMessage);
    return undefined as unknown as HTMLElement;
  });

  registerMediaSwipe(photoSwipe.value);

  photoSwipe.value.on("change", () => {
    if (photoSwipe.value?.pswp) {
      emit("change", {
        newIndex: photoSwipe.value.pswp.currIndex,
      });
    }
  });

  photoSwipe.value.init();
});

onUnmounted(() => {
  if (photoSwipe.value) {
    photoSwipe.value.destroy();
    photoSwipe.value = undefined;
  }
});

const { currentMedia, panelEl } = useInfoPanel();
</script>

<template>
  <div>
    <Teleport
      v-if="panelEl"
      :to="panelEl"
    >
      <div class="info-panel-contents">
        <MediaInfo :media="currentMedia" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.info-panel-contents {
  padding: 0 16px 1rem;
}
</style>
<style>
video-player {
  --media-border-radius: 0;
}

.pswp-loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: white;
  opacity: 0.6;

  .pi {
    font-size: 5rem;
  }
}
</style>
