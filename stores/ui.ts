import { defineStore } from 'pinia'

export const useUiState = defineStore('ui', {
  state: () => {
    return {
      sidebarExpanded: true,
      mediaView: 'grid',
      randomSeed: Math.floor(Math.random() * (100000 - 1)),
      debugMode: false,
    }
  },
  actions: {
    toggleSidebar() {
      this.sidebarExpanded = !this.sidebarExpanded
    },
  },
  persist: true,
})
