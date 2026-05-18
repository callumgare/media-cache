<template>
  <div
    id="app-root"
    :class="{ 'blur-media': uiState.mediaBlurred }"
  >
    <Toast />
    <div
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
import "primeicons/primeicons.css";
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

const uiState = useUiState();

const headerHiddenByDefault = computed(() => !!route.meta.hideHeader);
const headerExpanded = ref(false);
</script>

<style scoped>
  .hideable {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    transform: translateY(calc(-100% + 2.5rem));
    transition: transform 0.3s ease;

    &.expanded {
      transform: translateY(0);
    }

    &:hover .chevron-handle {
      opacity: 1;
    }
    .chevron-handle {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 2.5rem;
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
        color: rgba(255, 255, 255, 0.45);
        transition: transform 0.15s ease, color 0.15s ease;
      }
      &:hover .chevron-icon {
        color: rgba(255, 255, 255, 0.85);
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

  @layer reset;

  /********************
  Custom
  ********************/
  body {
    font-family: sans-serif;
    background: var(--primary-background);
  }

  body:has(#app-root.blur-media) {
    img, video {
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

  :root, :host {
    /* The page has a background so we make most things transparent with the exception of surfaces that overlap other surfaces */
    --p-content-background: transparent;
    --p-content-background-opaque: var(--p-surface-0);

    @media (prefers-color-scheme: dark) {
      --p-content-background-opaque: var(--p-surface-900);
    }

    --p-menubar-submenu-background: var(--p-content-background-opaque);
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
