<script setup lang="ts">
import 'primeicons/primeicons.css'
import { useDrag } from '@vueuse/gesture'
import { useMounted, useWindowSize } from '@vueuse/core'
import { useMotion } from '@vueuse/motion'
import type MediaFilterSidebar from '~/components/MediaFilterSidebar.vue'
import { clamp, closestNumber } from '~/lib/general'

const uiState = useUiState()
const sidebarRef = useTemplateRef<InstanceType<typeof MediaFilterSidebar>>('sidebar')
const sidebarElm = computed(() => sidebarRef.value?.$el || null)
const containerElm = ref<HTMLDivElement | null>(null)
const sidebarExpandButtonElm = ref<HTMLButtonElement | null>(null)

const isMounted = useMounted()
const windowSize = useWindowSize()
const windowWidth = computed(() => isMounted ? windowSize.width.value : 1000)

const sidebarWidth = computed(() => windowWidth.value * 0.9)
const sidebarXPos = ref(0)
const minSidebarXPos = computed(() => -sidebarWidth.value)
const maxSidebarXPos = computed(() => 0)

// Move sidebar to sidebarXPos
useMotion(sidebarElm, {
  initial: { x: sidebarXPos }, // Start closed
  animate: { x: sidebarXPos }, // Bind to reactive x
  transition: {
    type: 'spring',
    stiffness: 200,
    damping: 20,
  },
})

// Disable Safari iOS back gesture so it doesn't interfere with sidebar gesture
onMounted(() => {
  document.querySelector('body > *')?.addEventListener('touchstart', (event: TouchEvent) => {
    // The only way to disable back gesture is to call preventDefault() on a touchstart event. Unfortunately this
    // breaks a bunch of things like tapping on buttons. To avoid this we try only preventDefault() on touches
    // at the edge of the screen. We don't want to prevent the tapping of important navigational elements that
    // happen to be close to the edge however so we specifically exclude touchstart events that occur on those elements.
    const targetElementsToAllowSwipesFor = [
      sidebarExpandButtonElm.value,
      document.querySelector('.p-menubar-button'),
    ]
    const targetIsAllowedElement = event.target && targetElementsToAllowSwipesFor.some(element => element.contains(event.target))
    const touchNotOnLeftEdge = event.pageX > 30
    if (targetIsAllowedElement || touchNotOnLeftEdge) return
    // prevent swipe to navigate gesture
    event.preventDefault()
  }, { passive: false })
})

// Update sidebarXPos when container is dragged. We use the container rather than the sidebar itself so that it
// can be dragged out from it's closed state off the edge of the page
const dragController = useDrag(
  ({ offset: [dx], last, swipe }) => {
    // Stay within bounds
    if (last) {
      const xAxisSwipeDirection = swipe[0]
      if (xAxisSwipeDirection) {
        if (xAxisSwipeDirection > 0) {
          sidebarXPos.value = maxSidebarXPos.value
        }
        else {
          sidebarXPos.value = minSidebarXPos.value
        }
      }
      else {
        sidebarXPos.value = closestNumber(dx, minSidebarXPos.value, maxSidebarXPos.value)
      }
    }
    else {
      sidebarXPos.value = clamp(minSidebarXPos.value, dx, maxSidebarXPos.value)
    }
  },
  {
    domTarget: containerElm,
    axis: 'x',
    bounds: { left: minSidebarXPos.value, right: maxSidebarXPos.value },
  },
)

// Enable dragging of sidebar only when window width is small enough for collapsable
// sidebar functionality to be supported
watch(windowWidth, () => {
  if (!dragController.config.drag) return
  dragController.config.drag.enabled = windowWidth.value <= 500
}, { immediate: true })

// Change sidebar position if sidebarMobileCollapsed is changed
watch(() => uiState.sidebarMobileCollapsed, () => {
  sidebarXPos.value = uiState.sidebarMobileCollapsed ? minSidebarXPos.value : maxSidebarXPos.value
  // Update useDrag()'s internal offset
  dragController.state.drag.offset = [sidebarXPos.value, 0]
}, { immediate: true })

// If sidebarXPos is updated to an open or closed position then update sidebarMobileCollapsed
// to reflect that
watch(sidebarXPos, () => {
  if (sidebarXPos.value === minSidebarXPos.value || sidebarXPos.value === maxSidebarXPos.value) {
    uiState.sidebarMobileCollapsed = !(sidebarXPos.value > minSidebarXPos.value / 2)
  }
}, { immediate: true })
</script>

<template>
  <NuxtLayout name="base">
    <template #header-buttons>
      <button
        class="toggle-sidebar"
        @click="uiState.toggleSidebarMobileCollapsed"
      >
        Sidebar
      </button>
    </template>
    <div
      ref="containerElm"
      class="container"
      :class="uiState.sidebarMobileCollapsed && 'sidebar-collapsed-on-mobile'"
    >
      <MediaFilterSidebar
        id="page-sidebar"
        ref="sidebar"
        class="sidebar"
      />
      <button
        ref="sidebarExpandButtonElm"
        class="toggle-sidebar"
        @click="uiState.toggleSidebarMobileCollapsed"
      >
        <i class="pi pi-angle-right" />
      </button>
      <div
        class="sidebar-shadow"
        @click="uiState.toggleSidebarMobileCollapsed"
      />
      <div class="page">
        <NuxtPage />
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

    overflow: auto;
    display: grid;
    grid-template-columns: var(--default-sidebar-width) 1fr;
    grid-gap: 0;
    transition: grid-template-columns 0.3s ease-in-out;
    flex: 1 1 auto;

    .page {
      overflow: auto;
      padding: 1em;
    }

    .sidebar {
      width: var(--default-sidebar-width);
      height: 100%;
      z-index: 3;
      transition: width 0.1s ease-in-out, padding-left 0.1s ease-in-out, padding-right 0.1s ease-in-out;
      overflow: hidden auto;
      background: var(--primary-background);
    }

    .toggle-sidebar {
      position: absolute;
      z-index: 2;
      top: 2em;
      background: #ffffff91;
      border-radius: 0 1em 1em 0;
      border-left: 0;
      padding-left: 0.2em;
      transition: padding-left 0.1s ease-in-out;
    }

    .sidebar-shadow {
      content: '';
      display: block;
      position: absolute;
      background-color: auto;
      transition: background-color 0.1s ease-in-out;
      transition-delay: 0.05s;
    }

    .toggle-sidebar:hover {
      padding-left: 0.5em;
    }

  }

  @media (width <= 500px) {
    .toggle-sidebar {
      display: initial;
    }

    .container {
      .page {
        padding: 1em 0;
      }

      &.sidebar-collapsed-on-mobile {
        grid-template-columns: 0 1fr;

        .sidebar {
          padding-left: 0;
          padding-right: 0;
        }
      }

      &:not(.sidebar-collapsed-on-mobile) {
        grid-template-columns: calc( 100vw - 200px ) 200px;
        overflow-x: hidden;

        .sidebar {
          width: 90vw;
        }

        .sidebar-shadow {
          content: '';
          display: block;
          position: absolute;
          width: 100%;
          background-color: light-dark(#0000005e, #0000008e);
          height: 100%;
          top: 0;
          left: 0;
          z-index: 1;
        }

        .page {
          overflow-x: hidden;
        }
      }
    }
  }

  @media (width > 500px) {
    .sidebar {
      transform: initial !important; /* override inline css set by @vueuse/motion */
    }
  }
</style>
