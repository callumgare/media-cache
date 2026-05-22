import { defineStore } from "pinia";

export const useUiState = defineStore("ui", {
  state: () => ({
    sidebarMobileCollapsed: true,
    randomSeed: Math.floor(Math.random() * (100000 - 1)),
    debugMode: false,
    mediaBlurred: false,
    lastMediaView: "grid",
  }),
  actions: {
    toggleSidebarMobileCollapsed() {
      this.sidebarMobileCollapsed = !this.sidebarMobileCollapsed;
    },
  },
  persistExtended: {
    defaultStorage: "cookies",
    keyStorage: {
      sidebarMobileCollapsed: "none",
      randomSeed: "sessionStorage",
      gamepadMapping: "localStorage",
    },
  },
});
