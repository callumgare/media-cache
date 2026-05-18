<template>
  <NuxtLayout name="base">
    <template #header-center>
      <MediaViewSwitcher />
    </template>
    <div
      ref="scrollerRef"
      class="feed-scroller"
      data-testid="feed-scroller"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="vItem in virtualItems"
        :key="String(vItem.key)"
        :data-index="vItem.index"
      >
        <FeedSlide
          v-if="medias[vItem.index]"
          :media="medias[vItem.index]!"
          :is-current="vItem.index === currentIndex"
          :is-nearby="Math.abs(vItem.index - currentIndex) <= 2"
          :style="{
            height: `${vItem.size}px`,
            top: `${vItem.start}px`,
          }"
          @ended="advanceTo(vItem.index + 1)"
        />
      </div>
      <div v-if="isPending || isFetchingNextPage" class="loading-indicator">
        <i class="pi pi-spin pi-spinner" />
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import "primeicons/primeicons.css";
import { useUiState } from "@@/stores/ui";
import { useWindowVirtualizer } from "@tanstack/vue-virtual";
import { useEventListener, useWindowSize } from "@vueuse/core";

definePageMeta({
  layout: false,
  hideHeader: true,
});

// Enable CSS scroll-snap at the window level for swipe/wheel navigation,
// matching stash-tv's scroll-snap-type: y mandatory approach.
onMounted(() => {
  document.documentElement.style.scrollSnapType = "y mandatory";
  document.documentElement.style.overscrollBehaviorY = "contain";
});
onUnmounted(() => {
  document.documentElement.style.scrollSnapType = "";
  document.documentElement.style.overscrollBehaviorY = "";
});

const uiState = useUiState();

const {
  data,
  fetchNextPage,
  isPending,
  isFetchingNextPage,
  hasNextPage,
  medias,
} = useMediaResults();

// ─── Virtualizer ──────────────────────────────────────────────────────────

const { height: windowHeight } = useWindowSize();

const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: medias.value.length,
    estimateSize: () => windowHeight.value,
    overscan: 2,
  })),
);

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

// ─── Current index via IntersectionObserver ───────────────────────────────

const scrollerRef = ref<HTMLElement | null>(null);
const currentIndex = ref(0);

// Track each rendered slide element
const slideObserver = ref<IntersectionObserver | null>(null);
const indexByElement = new Map<Element, number>();

function setupObserver() {
  slideObserver.value?.disconnect();
  slideObserver.value = new IntersectionObserver(
    (entries) => {
      let maxRatio = 0;
      let mostVisibleIndex = currentIndex.value;
      for (const entry of entries) {
        const idx = indexByElement.get(entry.target);
        if (idx !== undefined && entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          mostVisibleIndex = idx;
        }
      }
      if (maxRatio > 0.3) currentIndex.value = mostVisibleIndex;
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
}

onMounted(() => {
  setupObserver();
});
onUnmounted(() => {
  slideObserver.value?.disconnect();
  indexByElement.clear();
});

// Re-observe whenever virtual items change
watch(virtualItems, () => {
  if (!slideObserver.value) return;
  const observer = slideObserver.value;
  observer.disconnect();
  indexByElement.clear();
  nextTick(() => {
    for (const el of document.querySelectorAll(".feed-slide")) {
      const idxAttr = (el.parentElement as HTMLElement | null)?.dataset.index;
      if (idxAttr !== undefined) {
        const idx = Number(idxAttr);
        indexByElement.set(el, idx);
        observer.observe(el);
      }
    }
  });
});

// ─── Pre-fetch next page when approaching the end ─────────────────────────

watch(currentIndex, (idx) => {
  if (
    idx >= medias.value.length - 5 &&
    hasNextPage.value &&
    !isFetchingNextPage.value
  ) {
    fetchNextPage();
  }
});

// ─── Keyboard navigation ──────────────────────────────────────────────────

function scrollToIndex(idx: number, behavior: ScrollBehavior = "smooth") {
  virtualizer.value.scrollToIndex(idx, { behavior });
}

function advanceTo(idx: number, behavior: ScrollBehavior = "smooth") {
  const clamped = Math.min(idx, medias.value.length - 1);
  currentIndex.value = clamped;
  scrollToIndex(clamped, behavior);
}

const videoControls = useCurrentVideoControls();

// Timer-based hold detection (mirrors the 250 ms gesture threshold)
let arrowRightHoldTimer: ReturnType<typeof setTimeout> | null = null;
let arrowLeftHoldTimer: ReturnType<typeof setTimeout> | null = null;
let arrowRightHolding = false;
let arrowLeftHolding = false;

useEventListener("keydown", (e: KeyboardEvent) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (e.repeat) return;
  if (e.key === " ") {
    e.preventDefault();
    videoControls.togglePlayPause();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    advanceTo(currentIndex.value + 1, "instant");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    advanceTo(Math.max(0, currentIndex.value - 1), "instant");
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    arrowRightHoldTimer = setTimeout(() => {
      arrowRightHoldTimer = null;
      arrowRightHolding = true;
      videoControls.startFastForward();
    }, 250);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    arrowLeftHoldTimer = setTimeout(() => {
      arrowLeftHoldTimer = null;
      arrowLeftHolding = true;
      videoControls.startRewind();
    }, 250);
  }
});

useEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === "ArrowRight") {
    if (arrowRightHoldTimer !== null) {
      clearTimeout(arrowRightHoldTimer);
      arrowRightHoldTimer = null;
      videoControls.seekForward();
    } else if (arrowRightHolding) {
      videoControls.stopFastSeek();
      arrowRightHolding = false;
    }
  } else if (e.key === "ArrowLeft") {
    if (arrowLeftHoldTimer !== null) {
      clearTimeout(arrowLeftHoldTimer);
      arrowLeftHoldTimer = null;
      videoControls.seekBackward();
    } else if (arrowLeftHolding) {
      videoControls.stopFastSeek();
      arrowLeftHolding = false;
    }
  }
});
</script>

<style>
#app-root:has(.feed-scroller) {
  max-height: none;
  height: auto;
  background: #000;
}

#app-root:has(.feed-scroller) .base-layout-contents {
  overflow: visible;
  flex: none;
}
</style>

<style scoped>
.feed-scroller {
  position: relative;
  width: 100%;
}

.loading-indicator {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.5rem;
  z-index: 50;
}
</style>
