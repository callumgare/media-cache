<script setup lang="ts">
import 'primeicons/primeicons.css'

const uiState = useUiState()
const refSidebar = ref<HTMLDivElement | null>(null)
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
      class="container"
      :class="uiState.sidebarMobileCollapsed && 'sidebar-collapsed-on-mobile'"
    >
      <MediaFilterSidebar
        ref="refSidebar"
        class="sidebar"
      />
      <button
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
          width: 0;
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
</style>
