<template>
  <div
    ref="scrollerRef"
    class="slide-list"
    :style="{ height: `${totalSize}px` }"
  >
    <div
      v-for="vItem in virtualItems"
      :key="String(vItem.key)"
      :data-index="vItem.index"
    >
      <div
        v-if="vItem.index === footerIndex"
        class="footer"
        :style="getItemStyle(vItem)"
      >
        <slot name="footer" />
      </div>
      <slot
        v-else
        :index="vItem.index"
        :is-current="vItem.index === currentIndex"
        :is-nearby="Math.abs(vItem.index - currentIndex) <= 2"
        :item-style="getItemStyle(vItem)"
        :advance="() => advanceTo(vItem.index + 1)"
      />
    </div>
    <!-- Ghost snap targets: one lightweight div per slide for every index
         that is NOT currently in the virtualizer's render window. This
         ensures CSS scroll-snap always has a snap point at each position so
         a programmatic scroll to a far-away index is never intercepted and
         stopped at the last rendered real slide. -->
    <div
      v-for="index in ghostSnapIndices"
      :key="`snap-${index}`"
      class="snap-ghost"
      :style="getItemStyle({ size: windowHeight, start: index * windowHeight })"
      aria-hidden="true"
    />
    <div v-if="!count" class="status-indicator">
      <slot name="noItems" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { type VirtualItem, useWindowVirtualizer } from "@tanstack/vue-virtual";
import { useEventListener, useWindowSize } from "@vueuse/core";
import type { StyleValue } from "vue";

const props = defineProps<{
  count: number;
  footerHeight?: number;
}>();

// ─── Virtualizer ──────────────────────────────────────────────────────────

const { height: windowHeight } = useWindowSize();

const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: props.count ? props.count + 1 : 0, // Extra item for the footer
    estimateSize: (index) => {
      if (index >= props.count) {
        // Footer item – give it some height so it can be scrolled to, but it
        // will grow if the content is taller.
        return props.footerHeight ?? 200;
      }
      return windowHeight.value;
    },
    overscan: 2,
  })),
);

// When the viewport height changes the virtualizer's item size cache becomes
// stale (it is only populated when items are first measured). Clear it so
// every slide is re-estimated at the current window height.
// We await nextTick() before scrolling so that Vue has flushed the new inline
// `top` / `height` styles onto the slide elements first. Without this, CSS
// scroll-snap evaluates against the *old* snap points and lands on the wrong
// slide (most visible at the end of a long list where the new totalSize is
// smaller than the old scrollY).
// intendedIndex mirrors currentIndex but is frozen during a viewport resize so
// the resize watcher can restore the correct slide even if the
// IntersectionObserver temporarily reports a different slide while the
// virtualizer is recalculating item positions at new heights.
let intendedIndex = 0;

// On resize, two mechanisms work together to keep the correct slide at the
// top of the viewport.
//
// 1. watch(windowHeight) – "viewport resize"
//    On the first event of a sequence it snapshots which slide was current and
//    locks currentIndex to that value (so the wrong slide never gets
//    .is-current).  Seeds virtualizer.scrollOffset with the target position so
//    the upcoming getVirtualItems() call renders the right slide.  Calls
//    measure() to keep TanStack's totalSize/item positions correct.  Arms a
//    100 ms debounce to unblock the IntersectionObserver when the resize ends.
//
// 2. watch(virtualItems) nextTick correction – "post-render snap"
//    After each Vue DOM update during a resize, the nextTick() callback
//    (a microtask) runs BEFORE the browser's rendering pipeline (layout →
//    ResizeObserver → IntersectionObserver → paint).  Calling scrollIntoView
//    here forces a synchronous layout and sets scrollY to the correct value
//    BEFORE IntersectionObserver fires, so the slide is never seen as outside
//    the viewport by the IO.
let resizeSnapshotIndex: number | null = null;
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(windowHeight, () => {
  // Capture the current slide on the FIRST resize event of the sequence.
  if (resizeSnapshotIndex === null) {
    resizeSnapshotIndex = currentIndex.value;
  }

  // Hold currentIndex at the snapshot value for the whole resize sequence.
  // This keeps .is-current on the correct (possibly not-yet-rendered) slide
  // so the wrong slide never satisfies toBeInViewport before the correction.
  currentIndex.value = resizeSnapshotIndex;

  // This watcher runs flush:'pre' – the DOM still has old heights and the
  // virtualizer's internal scrollOffset still holds the pre-resize value.
  //
  // Problem: the virtualizer reads its own scrollOffset (not window.scrollY)
  // when computing getVirtualItems().  If we let the scroll event update
  // scrollOffset asynchronously, the upcoming render uses the old offset and
  // renders items near the OLD position, not the target slide.  When the
  // scroller then shrinks, the browser clamps scrollY and the target slide's
  // DOM element gets unmounted, causing IO to fire isIntersecting:false.
  //
  // Fix: directly seed virtualizer.scrollOffset with targetY so the upcoming
  // getVirtualItems() call places the target slide in the render window.
  const targetY = resizeSnapshotIndex * windowHeight.value;
  // Directly seed the virtualizer's scroll offset (plain property, not a
  // reactive ref – only updated via scroll events otherwise).
  virtualizer.value.scrollOffset = targetY;

  // Clears TanStack's size cache and triggers notify() → triggerRef so the
  // updated scrollOffset flows into the next getVirtualItems() call.
  virtualizer.value.measure();

  // (Re)arm the debounce fallback.
  if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null;
    if (resizeSnapshotIndex === null) return;
    const targetIdx = resizeSnapshotIndex;
    resizeSnapshotIndex = null;
    currentIndex.value = targetIdx;
  }, 100);
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());
const footerIndex = computed(() => props.count);

const ghostSnapIndices = computed(() => {
  const rendered = new Set(virtualItems.value.map((v) => v.index));
  return Array.from({ length: props.count }, (_, i) => i).filter(
    (i) => !rendered.has(i),
  );
});

function getItemStyle(vItem: Pick<VirtualItem, "size" | "start">): StyleValue {
  return {
    position: "absolute",
    height: `${vItem.size}px`,
    width: "100%",
    top: `${vItem.start}px`,
    "scroll-snap-align": "start",
    "scroll-snap-stop": "always",
  };
}

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
      if (maxRatio > 0.3) {
        // Don't update during a resize sequence – the watcher holds currentIndex
        // at the snapshot value until the debounce scrolls to the right position.
        if (resizeSnapshotIndex === null) {
          currentIndex.value = mostVisibleIndex;
          intendedIndex = mostVisibleIndex;
        }
      }
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
    for (const el of scrollerRef.value?.querySelectorAll("[data-index] > *") ??
      []) {
      const wrapper = el.parentElement as HTMLElement | null;
      const idxAttr = wrapper?.dataset.index;
      if (idxAttr !== undefined) {
        const idx = Number(idxAttr);
        indexByElement.set(el, idx);
        observer.observe(el);
        // While a resize is active, immediately correct the scroll position
        // before the rendering pipeline runs.
        if (resizeSnapshotIndex !== null && idx === resizeSnapshotIndex) {
          // This nextTick callback is a microtask – runs before the browser's
          // rendering pipeline (layout → RO → IO → paint).  scrollIntoView
          // forces a synchronous layout and updates scrollY here so that when
          // IntersectionObserver fires the slide is already in the viewport.
          // Must use the slide element itself: its wrapper is height:0 in
          // normal flow (position:absolute child), scrollIntoView on the
          // wrapper always goes to y:0.
          (el as HTMLElement).scrollIntoView({
            behavior: "instant",
            block: "start",
          });
        }
      }
    }
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────

function scrollToIndex(idx: number, behavior: ScrollBehavior = "smooth") {
  virtualizer.value.scrollToIndex(idx, { behavior });
}

function advanceTo(idx: number, behavior: ScrollBehavior = "smooth") {
  const clamped = Math.min(idx, props.count); // `count` not `count - 1` to allow advancing to the footer
  currentIndex.value = clamped;
  intendedIndex = clamped;
  scrollToIndex(clamped, behavior);
}

useEventListener("keydown", (e: KeyboardEvent) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (e.repeat) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    advanceTo(currentIndex.value + 1, "instant");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    advanceTo(Math.max(0, currentIndex.value - 1), "instant");
  }
});

const emit = defineEmits<{
  indexChange: [index: number];
}>();

watch(currentIndex, (idx) => {
  emit("indexChange", idx);
});

defineExpose({ currentIndex, advanceTo });
</script>

<style>
#app-root:has(.slide-list) {
  max-height: none;
  height: auto;
  background: #000;
}

#app-root:has(.slide-list) .base-layout-contents {
  overflow: visible;
  flex: none;
}

html:has(.slide-list) {
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
}
</style>

<style scoped>
.slide-list {
  position: relative;
  width: 100%;
}
.status-indicator {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  max-width: 100%;
  max-height: 100%;
}
</style>
