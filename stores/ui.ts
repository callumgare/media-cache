import { defineStore } from "pinia";
import { GAMEPAD_MAPPINGS } from "~/lib/gamepad-mappings";

export const useUiState = defineStore("ui", {
  state: () => ({
    sidebarMobileCollapsed: true,
    randomSeed: Math.floor(Math.random() * (100000 - 1)),
    debugMode: false,
    mediaBlurred: false,
    lastMediaView: "grid",
    gamepadMapping: GAMEPAD_MAPPINGS[0]?.id ?? null,
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
