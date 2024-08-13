import { defineStore } from 'pinia'

export const useUiState = defineStore('ui', {
  state: () => {
    return {
      sidebarExpanded: true,
    }
  },
  actions: {
    toggleSidebar() {
      this.sidebarExpanded = !this.sidebarExpanded
    },
  },
})
