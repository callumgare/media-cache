<template>
  <NuxtLayout name="base">
    <template #header-center>
      <MediaViewSwitcher />
    </template>
    <SlideList
      :count="medias.length"
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
      <template #footer>
        <div v-if="isPending || isFetchingNextPage" class="loading-indicator">
          <i class="pi pi-spin pi-spinner" />
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
  hideHeader: true,
});

const { fetchNextPage, isPending, isFetchingNextPage, hasNextPage, medias } =
  useMediaResults();

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
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.5rem;
  z-index: 50;
}
</style>
