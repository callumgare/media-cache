import { defineStore } from 'pinia'

export const useUiState = defineStore('ui', {
  state: () => {
    return {
      sidebarMobileCollapsed: true,
      mediaView: 'grid',
      randomSeed: Math.floor(Math.random() * (100000 - 1)),
      debugMode: false,
    }
  },
  actions: {
    toggleSidebarMobileCollapsed() {
      this.sidebarMobileCollapsed = !this.sidebarMobileCollapsed
    },
  },
  persist: {
    omit: ['sidebarMobileCollapsed'],
  },
})
