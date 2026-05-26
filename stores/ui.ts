import { defineStore } from "pinia";
import { GAMEPAD_MAPPINGS } from "~/lib/gamepad-mappings";

export const useUiState = defineStore("ui", {
  state: () => ({
    sidebarMobileCollapsed: true,
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
      gamepadMapping: "localStorage",
    },
  },
});
