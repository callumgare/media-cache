<script setup lang="ts">
import { useUiState } from '@/stores/ui'

const uiState = useUiState()
console.log('useUiState', useUiState.sidebarExpanded)
</script>

<template>
  <NuxtLayout name="base">
    <div class="container">
      <MediaFilterSidebar
        class="sidebar"
        :style="{ ...(!uiState.sidebarExpanded ? { width: '0' } : {}) }"
      />
      <div class="page">
        <NuxtPage />
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
  .container {
    display: flex;
  }

  .page {
    margin: 1em;
  }

  .sidebar {
    flex: 0 0 auto;
    width: 200px;
    overflow: hidden;
  }
</style>
