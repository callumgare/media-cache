import type { UserPreferences } from "@@/server/database/schema";
import { defineStore } from "pinia";

type PrefsFields = Pick<
  UserPreferences,
  "loopVideo" | "muteVideo" | "videoFit"
>;

type PrefsState = PrefsFields & { _initialized: boolean };

type PreferencesPatch = Partial<PrefsFields>;

type PrefsResponse = PrefsFields;

export const useUserPreferences = defineStore("user-preferences", {
  state: (): PrefsState => ({
    loopVideo: false,
    muteVideo: true,
    videoFit: "cover",
    _initialized: false,
  }),
  actions: {
    async init() {
      if (this._initialized) return;
      const data = await $fetch<PrefsResponse>("/api/user/preferences");
      this.$patch({
        loopVideo: data.loopVideo,
        muteVideo: data.muteVideo,
        videoFit: data.videoFit,
        _initialized: true,
      });
    },
    async set(patch: PreferencesPatch) {
      this.$patch(patch);
      await $fetch("/api/user/preferences", {
        method: "PATCH",
        body: patch,
      });
    },
  },
});
