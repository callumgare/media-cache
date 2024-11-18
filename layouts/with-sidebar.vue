<script setup lang="ts">
import { useUiState } from '@/stores/ui'

const uiState = useUiState()
</script>

<template>
  <NuxtLayout name="base">
    <template #header-buttons>
      <button
        class="toggle-sidebar"
        @click="uiState.toggleSidebar"
      >
        Sidebar
      </button>
    </template>
    <div class="container">
      <MediaFilterSidebar
        :class="['sidebar', uiState.sidebarExpanded && 'expanded']"
      />
      <div class="page">
        <NuxtPage />
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
  .container {
    overflow: auto;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-gap: 0;

    .page {
      padding: 1em;
      overflow: auto;
    }
  }

  .toggle-sidebar {
    display: none;
  }

  @media (width <= 500px) {
    .toggle-sidebar {
      display: initial;
    }

    .container {
      grid-template-columns: 1fr;

      .sidebar {
        &.expanded {
          position: absolute;
          left: 0;
          right: 0;
          width: 100%;
          background: white;
          margin: 0;
          padding: 1em;
          bottom: 0;
          min-height: 100%;
          z-index: 1;
        }

        &:not(.expanded) {
          display: none;
        }
      }
    }
  }
</style>
