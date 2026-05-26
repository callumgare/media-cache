<template>
  <NuxtLayout
    name="with-sidebar"
    :always-overlay="true"
    :hide-header="true"
  >
    <template #header-center>
      <MediaViewSwitcher />
    </template>
    <SlideList
      :count="medias.length"
      :footer-height="200"
      data-testid="feed-scroller"
      @index-change="handleIndexChange"
    >
      <template #default="{ index, isCurrent, isNearby, itemStyle, advance }">
        <FeedSlide
          v-if="medias[index]"
          :media="medias[index]!"
          :is-current="isCurrent"
          :is-nearby="isNearby"
          :style="itemStyle"
          @ended="advance()"
        />
      </template>
      <template #noItems>
        <i class="pi pi-spin pi-spinner loading-indicator" />
      </template>
      <template #footer>
        <div class="footer-content">
          <template v-if="isPending || isFetchingNextPage">
            <i class="pi pi-spin pi-spinner loading-indicator" />
          </template>
          <template v-else-if="mediaError">
            <span class="pi pi-exclamation-triangle" />
            An error occurred while loading media.
          </template>
          <template v-else-if="!medias.length && !isPending">
            No results. Try modifying the search.
          </template>
          <template v-else-if="medias.length && !hasNextPage && !isPending">
            No more media
          </template>
          <template v-else>
            {{ fetchNextPage() }}
            An error occurred. There are more media to load no loading is occurring.
          </template>
        </div>
      </template>
    </SlideList>
  </NuxtLayout>
</template>

<script setup lang="ts">
import "primeicons/primeicons.css";
import { useEventListener } from "@vueuse/core";

definePageMeta({
  layout: false,
});

const {
  fetchNextPage,
  isPending,
  isFetchingNextPage,
  hasNextPage,
  medias,
  error: mediaError,
} = useMediaResults();

// ─── Pre-fetch next page when approaching the end ─────────────────────────

function handleIndexChange(idx: number) {
  if (
    idx >= medias.value.length - 5 &&
    hasNextPage.value &&
    !isFetchingNextPage.value
  ) {
    fetchNextPage();
  }
}

// ─── Keyboard navigation ──────────────────────────────────────────────────

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

<style scoped>
.loading-indicator {
  color: rgba(255, 255, 255, 0.7);
  font-size: 5rem;
}
.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.5rem;
}
</style>
