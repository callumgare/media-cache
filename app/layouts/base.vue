<template>
  <div
    id="app-root"
    :class="{ 'blur-media': uiState.mediaBlurred }"
  >
    <Toast />
    <div
      ref="headerContainerRef"
      :class="[headerHiddenByDefault ? ['hideable', { expanded: headerExpanded }] : '']"
    >
      <SiteHeader :breadcrumbs="breadcrumbs" class="site-header">
        <template #center><slot name="header-center" /></template>
        <template #header-buttons><slot name="header-buttons" /></template>
      </SiteHeader>
      <button
        v-if="headerHiddenByDefault"
        class="chevron-handle"
        :class="{ 'is-expanded': headerExpanded }"
        :aria-label="headerExpanded ? 'Hide header' : 'Show header'"
        data-testid="feed-header-chevron"
        @click="headerExpanded = !headerExpanded"
      >
        <i
          class="chevron-icon"
          :class="headerExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
        />
      </button>
    </div>
    <div class="base-layout-contents">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import type { MenuItem } from "primevue/menuitem";

const route = useRoute();

function isBreadcrumbs(value: unknown): value is string[] | MenuItem[] {
  if (!Array.isArray(value)) return false;
  if (value.every((item) => typeof item === "string")) return true;
  if (value.every((item) => typeof item === "object" && item !== null))
    return true;
  return false;
}

const breadcrumbs = computed(() => {
  let { breadcrumbs: meta } = route.meta;
  if (typeof meta === "function") {
    meta = meta({ route });
  }
  return isBreadcrumbs(meta) ? meta : undefined;
});

const props = defineProps<{
  hideHeader?: boolean;
}>();

const uiState = useUiState();

const headerContainerRef = ref<HTMLElement | null>(null);
const headerHiddenByDefault = computed(
  () => props.hideHeader ?? !!route.meta.hideHeader,
);
// On a SPA navigation to a hideable page, base.vue is remounted on the
// client only (no SSR). Initialising headerExpanded here — before the first
// render — ensures the template always sees `hideable + expanded` together
// and never renders the collapsed state that would trigger a slide-in
// transition. We guard with import.meta.client because window is not
// available during SSR. For a direct page load history.state.back is null,
// so the header starts collapsed and matches the server-rendered HTML.
const headerExpanded = ref(
  import.meta.client &&
    headerHiddenByDefault.value &&
    !!window.history.state?.back,
);

// Detect a fine-pointer (mouse/trackpad) device. Set in onMounted to avoid SSR mismatch.
const hasMouse = ref(false);
let currentMouseY: number | null = null;
let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;
// Once the header is expanded, only start the collapse timer after the mouse
// has entered the top region at least once. This prevents the header from
// immediately auto-collapsing when it is shown while the cursor is elsewhere.
let mouseHasEnteredTopRegion = false;
const headerCollapseHitboxHeight = 200; // px from top of viewport within which the header will expand

onMounted(() => {
  hasMouse.value = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  // Auto-collapse the header when the cursor leaves the top region, but only
  // after it has entered the region at least once since the header was expanded.
  // This prevents the header from immediately auto-collapsing when it is shown
  // (via Escape, SPA nav, etc.) while the cursor happens to be elsewhere.
  mouseMoveHandler = (e: MouseEvent) => {
    currentMouseY = e.clientY;
    if (
      !headerHiddenByDefault.value ||
      !hasMouse.value ||
      !headerExpanded.value
    ) {
      if (collapseTimer !== null) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      return;
    }
    if (e.clientY <= headerCollapseHitboxHeight) {
      mouseHasEnteredTopRegion = true;
      if (collapseTimer !== null) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    } else if (mouseHasEnteredTopRegion) {
      if (collapseTimer === null) {
        collapseTimer = setTimeout(() => {
          collapseTimer = null;
          headerExpanded.value = false;
        }, 500);
      }
    }
  };
  document.addEventListener("mousemove", mouseMoveHandler);

  // Escape key: show the header when it is hidden.
  keydownHandler = (e: KeyboardEvent) => {
    if (
      e.key === "Escape" &&
      headerHiddenByDefault.value &&
      !headerExpanded.value
    ) {
      headerExpanded.value = true;
    }
  };
  document.addEventListener("keydown", keydownHandler);
});

// Handles the case where base.vue is kept alive across navigations and
// headerHiddenByDefault changes value in the same component instance — e.g.
// navigating between two pages that both use an explicit <NuxtLayout> but with
// different hideHeader values.
//
// SPA navigations that fully remount base.vue are handled by the headerExpanded
// ref initialisation above instead.
//
// flush:'sync' ensures headerExpanded is set before the first post-change
// render, preventing a frame where the element has 'hideable' without 'expanded'.
watch(
  headerHiddenByDefault,
  (isHideable, wasHideable) => {
    if (isHideable && !wasHideable) {
      headerExpanded.value = true;
    } else if (!isHideable) {
      // Defer the state reset to the next tick so that the CSS collapse
      // transition doesn't play while the hideable page is still in the DOM
      // during the layout swap.
      clearTimeout(collapseTimer ?? undefined);
      collapseTimer = null;
      nextTick(() => {
        if (!headerHiddenByDefault.value) {
          headerExpanded.value = false;
        }
      });
    }
  },
  { flush: "sync" },
);

// Touch device: collapse when a pointer-down lands outside the header.
let removeOutsideTapListener: (() => void) | null = null;

watch(headerExpanded, (expanded) => {
  if (expanded) {
    // Reset so the collapse timer only arms after the cursor enters the top
    // region for the first time since the header became visible.
    mouseHasEnteredTopRegion = false;
  }
  removeOutsideTapListener?.();
  removeOutsideTapListener = null;
  if (!expanded || !headerHiddenByDefault.value || hasMouse.value) return;

  // Defer by one task so the pointerdown that triggered the expansion
  // doesn't immediately re-close the header.
  setTimeout(() => {
    const handler = (e: PointerEvent) => {
      if (
        headerContainerRef.value &&
        !headerContainerRef.value.contains(e.target as Node)
      ) {
        headerExpanded.value = false;
      }
    };
    document.addEventListener("pointerdown", handler);
    removeOutsideTapListener = () =>
      document.removeEventListener("pointerdown", handler);
  }, 0);
});

onUnmounted(() => {
  if (mouseMoveHandler) {
    document.removeEventListener("mousemove", mouseMoveHandler);
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
  }
  if (collapseTimer !== null) {
    clearTimeout(collapseTimer);
  }
  removeOutsideTapListener?.();
});
</script>

<style scoped>
  .hideable {
    --handle-height: calc(2.5rem + env(safe-area-inset-top));
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    transform: translateY(calc(-100% + var(--handle-height)));
    transition: transform 0.3s ease, --handle-height 0.3s ease;

    &.expanded {
      transform: translateY(0);
      --handle-height: 2.5rem;
    }

    &:hover .chevron-handle {
      opacity: 1;
    }
    .chevron-handle {
      display: flex;
      justify-content: center;
      padding-bottom: 1em;
      align-items: end;
      width: 100%;
      height: var(--handle-height);
      background: transparent;
      border: none;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s ease;

      &.is-expanded {
        opacity: 1;
      }
      .chevron-icon {
        font-size: 0.9rem;
        color: var(--p-surface-0);
        opacity: 0.45;
        -webkit-text-stroke: 1px var(--p-surface-400);
        paint-order: stroke fill;
        transition: transform 0.15s ease, color 0.15s ease, opacity 0.15s ease;
      }
      &:hover .chevron-icon {
        color: var(--p-surface-0);
        opacity: 0.85;
      }

      &:not(.is-expanded):hover .chevron-icon {
        transform: translateY(3px);
      }

      &.is-expanded:hover .chevron-icon {
        transform: translateY(-3px);
      }
    }
  }



</style>

<style>
  @import "primeicons/primeicons.css" layer(primeicons);

  #app-root {
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  #app-root .site-header {
    /* Ensure any header menus are placed on-top of the sidebar */
    z-index: 5;
  }

  #app-root .base-layout-contents {
    overflow: auto;
    display: flex;
    flex-direction: column;
    position: relative;
    flex: 1 1 auto;
  }

  @property --handle-height {
    syntax: "<length>";
    inherits: true;
    initial-value: 2.5rem;
  }

  /********************
  Custom
  ********************/
  @layer custom {
    html,
    body {
      /* Prevent iOS Safari swipe-right-to-go-back navigation gesture (iOS 16+). */
      overscroll-behavior-x: contain;
    }
    body {
      font-family: sans-serif;
      background: var(--primary-background);
    }

    body:has(#app-root.blur-media) {
      img, video, hls-video::part(video), dash-video::part(video) {
        filter:  url("/abstractify-filter.svg#abstractify");
      }
    }

    :root {
      --primary-background: light-dark(var(--p-zinc-100), var(--p-zinc-900));
      --bg-highlight: var(--p-yellow-100);

      @media (prefers-color-scheme: dark) {
        --bg-highlight: var(--p-yellow-700);
      }
    }

    @keyframes target-fade {
      0% { background-color: var(--bg-highlight); }
      100% { background-color: transparent; }
    }

    :target {
      animation: target-fade 3s 1;
    }

    .p-button {
      line-height: normal;
    }

    .p-inputgroup .p-inputnumber:not(:first-child) input {
      margin-left: -1px;
    }

    :root, :host {
      /* The page has a background so we make most things transparent with the exception of surfaces that overlap other surfaces */
      --p-content-background: transparent;
      --p-content-background-opaque: var(--p-surface-0);
      --p-card-background: var(--p-content-background-opaque);
      --card-background: var(--p-surface-0);
      --card-border-color: var(--p-surface-200);
      --z-index-overlay: 100;
      --z-index-max: 1000;

      @media (prefers-color-scheme: dark) {
        --p-content-background-opaque: var(--p-surface-700);
        --card-background: var(--p-surface-800);
        --card-border-color: var(--p-surface-600);
      }

      --p-menubar-submenu-background: var(--p-content-background-opaque);
    }

    .pswp {
      --pswp-root-z-index: var(--z-index-overlay);
    }

    .p-toast {
      z-index: var(--z-index-max) !important; /* We need to override the z-index set directly on the element */
    }

    body:has(.pswp--open) .p-toast {
      translate: 0 40px; /* Move toasts down when photoswipe is open to avoid overlap with toolbar */
    }
  }


  /********************
  CSS Reset
  Based on: https://www.joshwcomeau.com/css/custom-css-reset/
  ********************/
  @layer reset {
    /*
    1. Use a more-intuitive box-sizing model.
    */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    /*
      2. Remove default margin
    */
    * {
      margin: 0;
    }

    /*
      Typographic tweaks!
      3. Add accessible line-height
      4. Improve text rendering
    */
    body {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /*
      5. Improve media defaults
    */
    img, picture, video, canvas, svg {
      display: block;
    }

    /*
      6. Remove built-in form typography styles
    */
    input, button, textarea, select {
      font: inherit;
    }

    /*
      7. Avoid text overflows
    */
    p, h1, h2, h3, h4, h5, h6 {
      overflow-wrap: break-word;
    }

    /*
      8. Create a root stacking context
    */
    #app-root, #__nuxt {
      isolation: isolate;
    }
  }
</style>
