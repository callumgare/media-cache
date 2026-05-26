<script setup lang="ts">
import "primeicons/primeicons.css";
import { useUiState } from "@@/stores/ui";
import { useWindowSize } from "@vueuse/core";
import { useDrag } from "@vueuse/gesture";
import type MediaFilterSidebar from "~/components/MediaFilterSidebar.vue";
import { clamp } from "~/lib/general";

const props = defineProps<{
  alwaysOverlay?: boolean;
  hideHeader?: boolean;
}>();

const uiState = useUiState();
const sidebarRef =
  useTemplateRef<InstanceType<typeof MediaFilterSidebar>>("sidebar");
const sidebarElm = computed(() => sidebarRef.value?.$el || null);
const containerElm = ref<HTMLDivElement | null>(null);
const sidebarExpandButtonElm = ref<HTMLButtonElement | null>(null);

const windowSize = useWindowSize({ initialWidth: 1000 });
const windowWidth = computed(() => windowSize.width.value);
const isOverlayMode = computed(
  () => props.alwaysOverlay || windowWidth.value <= 500,
);

// Pixel transform applied during drag. null = CSS class handles open/closed position.
// CSS uses translateX(-100%) for closed (= sidebar's own width, always correct without JS).
const dragTranslateX = ref<number | null>(null);
// When true, a CSS transition is active on the drag inline style (drag-release snap animation)
const isDragAnimating = ref(false);
let animatingTimer: ReturnType<typeof setTimeout> | null = null;

// Inline style for the sidebar element
const sidebarStyle = computed(() => {
  if (dragTranslateX.value !== null) {
    return {
      transform: `translateX(${dragTranslateX.value}px)`,
      transition: isDragAnimating.value ? "transform 0.3s ease-out" : "none",
    };
  }
  return {};
});

function getSidebarWidth(): number {
  return (sidebarElm.value as HTMLElement | null)?.offsetWidth ?? 0;
}

function syncDragOffset(collapsed: boolean) {
  const w = getSidebarWidth();
  dragController.state.drag.offset = [collapsed ? -w : 0, 0];
}

// Disable Safari iOS back gesture so it doesn't interfere with sidebar gesture
onMounted(() => {
  // Sync drag controller's internal offset with the real sidebar pixel width
  syncDragOffset(uiState.sidebarMobileCollapsed);

  // @ts-expect-error Types in vue don't seem to cover all the events yet
  document.querySelector("body > *")?.addEventListener(
    "touchstart",
    (event: Event & { target: HTMLElement; pageX: number }) => {
      // The only way to disable back gesture is to call preventDefault() on a touchstart event. Unfortunately this
      // breaks a bunch of things like tapping on buttons. To avoid this we try only preventDefault() on touches
      // at the edge of the screen. We don't want to prevent the tapping of important navigational elements that
      // happen to be close to the edge however so we specifically exclude touchstart events that occur on those elements.
      const targetElementsToAllowSwipesFor = [
        sidebarExpandButtonElm.value,
        document.querySelector(".p-menubar-button"),
      ].filter((element) => element !== null);
      const targetIsAllowedElement =
        event.target &&
        targetElementsToAllowSwipesFor.some((element) =>
          element.contains(event.target),
        );
      const touchNotOnLeftEdge = event.pageX > 30;
      if (targetIsAllowedElement || touchNotOnLeftEdge) return;
      // prevent swipe to navigate gesture
      event.preventDefault();
    },
    { passive: false },
  );
});

// Update sidebar position when container is dragged. We use the container rather than the sidebar
// itself so that it can be dragged out from its closed state off the edge of the page.
const dragController = useDrag(
  ({ offset: [dx], last, first, event, cancel, canceled, swipe }) => {
    // If the gesture starts on an interactive element, cancel it immediately so
    // the element's own click handler fires uninterrupted. Without this,
    // filterTaps would call stopPropagation() on the click event when movement
    // >= TAP_DISTANCE_THRESHOLD (3 px), swallowing the button action.
    if (first) {
      const target = event?.target as HTMLElement | null;
      if (target?.closest('button, a, [role="button"]')) {
        cancel();
        return;
      }
    }
    if (canceled) return;

    const w = getSidebarWidth();
    if (w === 0) return; // not mounted yet
    if (last) {
      // Drag released: animate to nearest snap point.
      // First mark as animating (adds transition to inline style), then change value in the next
      // frame so the browser sees the transition before the transform value changes.
      const xAxisSwipeDirection = swipe[0];
      const shouldOpen = xAxisSwipeDirection
        ? xAxisSwipeDirection > 0
        : dx > -(w / 2);
      isDragAnimating.value = true;
      requestAnimationFrame(() => {
        dragTranslateX.value = shouldOpen ? 0 : -w;
        uiState.sidebarMobileCollapsed = !shouldOpen;
        syncDragOffset(!shouldOpen);
        if (animatingTimer) clearTimeout(animatingTimer);
        animatingTimer = setTimeout(() => {
          // Animation done: hand control back to CSS. The CSS translateX(-100%) / translateX(0)
          // exactly matches where the inline px animation ended, so there's no snap.
          dragTranslateX.value = null;
          isDragAnimating.value = false;
        }, 300);
      });
    } else {
      // Mid-drag: follow finger instantly with no transition
      dragTranslateX.value = clamp(-w, dx, 0);
    }
  },
  {
    domTarget: containerElm,
    axis: "x",
  },
);

// Enable dragging in overlay mode (mobile viewport or alwaysOverlay prop).
// Also collapse sidebar when crossing the mobile threshold (but not when alwaysOverlay).
watch(
  windowWidth,
  (newWidth, oldWidth) => {
    if (!dragController.config.drag) return;
    dragController.config.drag.enabled = isOverlayMode.value;
    if (!isOverlayMode.value) {
      dragTranslateX.value = null;
      isDragAnimating.value = false;
    }
    if (
      !props.alwaysOverlay &&
      oldWidth !== undefined &&
      oldWidth > 500 &&
      newWidth <= 500
    ) {
      uiState.sidebarMobileCollapsed = true;
      syncDragOffset(true);
    }
  },
  { immediate: true },
);

// When sidebarMobileCollapsed changes programmatically (not via toggle button), clear any
// drag state and re-sync the drag controller offset.
watch(
  () => uiState.sidebarMobileCollapsed,
  (collapsed) => {
    dragTranslateX.value = null;
    syncDragOffset(collapsed);
  },
);

// Animated toggle for user-initiated open/close (buttons & shadow tap).
// Uses await nextTick() so the CSS transition is applied before the transform changes.
async function toggleSidebar() {
  isDragAnimating.value = true;
  dragTranslateX.value = uiState.sidebarMobileCollapsed
    ? -getSidebarWidth()
    : 0;
  await nextTick();
  uiState.sidebarMobileCollapsed = !uiState.sidebarMobileCollapsed;
  dragTranslateX.value = uiState.sidebarMobileCollapsed
    ? -getSidebarWidth()
    : 0;
  syncDragOffset(uiState.sidebarMobileCollapsed);
  if (animatingTimer) clearTimeout(animatingTimer);
  animatingTimer = setTimeout(() => {
    dragTranslateX.value = null;
    isDragAnimating.value = false;
  }, 300);
}
</script>

<template>
  <NuxtLayout
    name="base"
    :hide-header="props.hideHeader"
  >
    <template #header-center>
      <slot name="header-center" />
    </template>
    <template #header-buttons>
      <button
        class="toggle-sidebar"
        @click="toggleSidebar"
      >
        Sidebar
      </button>
    </template>
    <div
      ref="containerElm"
      class="container"
      :class="[
        uiState.sidebarMobileCollapsed && 'sidebar-collapsed-on-mobile',
        isOverlayMode && 'as-overlay',
        props.hideHeader && 'hide-header',
      ]"
    >
      <MediaFilterSidebar
        id="page-sidebar"
        ref="sidebar"
        class="sidebar"
        data-testid="page-sidebar"
        :style="sidebarStyle"
      />
      <div
        class="sidebar-shadow"
        @click="toggleSidebar"
      />
      <div
        class="page"
        data-testid="page"
      >
        <slot />
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
  .pi {
    vertical-align: middle;
  }

  .toggle-sidebar {
    display: none;
  }

  .container {
    --default-sidebar-width: 250px;
    --sidebar-z-index: 3;

    display: grid;
    grid-template-columns: var(--default-sidebar-width) 1fr;
    gap: 0;
    transition: grid-template-columns 0.3s ease-in-out;
    flex: 1 0 auto;

    .page {
      padding: 1em;
    }


    .sidebar {
      width: min(var(--default-sidebar-width), 90vw);
      position: sticky;
      top: 0;
      align-self: start;
      max-height: 100vh;
      z-index: var(--sidebar-z-index);
      transition: width 0.1s ease-in-out, padding-left 0.1s ease-in-out, padding-right 0.1s ease-in-out;
      overflow: hidden auto;
      background: var(--primary-background);
    }

    .sidebar-shadow {
      content: '';
      display: block;
      position: absolute;
      background-color: inherit;
      transition: background-color 0.1s ease-in-out;
      transition-delay: 0.05s;
    }

    /* Overlay mode: sidebar slides in over the page content.
    Applied on mobile (via JS adding this class) and when alwaysOverlay prop is set. */
    &.as-overlay {
      position: relative;
      grid-template-columns: 1fr;
      flex: 1 1 auto;
      --sidebar-z-index: calc(var(--z-index-overlay) + 10); /* put on top of header */

      .page {
        padding: 1em 0;
      }

      /* Sidebar is fixed to the viewport so it overlays header and all content. */
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        max-height: 100vh;
        align-self: unset;
        transform: translateX(-100%); /* closed by default */
        transition: transform 0.3s ease-out;
        padding-top: calc(1em + env(safe-area-inset-top));
        padding-left: calc(1em + env(safe-area-inset-left));
        padding-bottom: calc(1em + env(safe-area-inset-bottom));
      }

      &:not(.sidebar-collapsed-on-mobile) .sidebar {
        transform: translateX(0);
      }

      /* Shadow is also fixed so it covers the full viewport including the header. */
      .sidebar-shadow {
        position: fixed;
        width: 100vw;
        height: 100vh;
        top: 0;
        left: 0;
        z-index: calc(var(--sidebar-z-index) - 1);
        background-color: light-dark(#0000005e, #0000008e);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease-in-out;
        transition-delay: 0s;
      }

      &:not(.sidebar-collapsed-on-mobile) .sidebar-shadow {
        opacity: 1;
        pointer-events: auto;
      }
    }

    &.hide-header .page {
      padding: 0;
    }
  }

  @media (width <= 500px) {
    .toggle-sidebar {
      display: initial;
    }

    /* On mobile the sidebar takes full-width treatment; JS applies .as-overlay for the rest */
    .container.as-overlay .sidebar {
      width: 90vw;
    }
  }

  @media (width > 500px) {
    .container:not(.as-overlay) .sidebar {
      transform: initial !important; /* override any inline drag transform */
      transition: none !important;
    }
  }
</style>
