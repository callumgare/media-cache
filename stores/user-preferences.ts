import type { UserPreferences } from "@@/server/database/schema";
import { defineStore } from "pinia";

type PrefsFields = Awaited<
  ReturnType<typeof $fetch<unknown, "/api/user/preferences">>
>;

type PrefsState = PrefsFields & { _initialized: boolean };

export const useUserPreferences = defineStore("user-preferences", () => {
  const state = reactive<PrefsState>({
    loopVideo: false,
    muteVideo: true,
    videoFit: "cover",
    videoStartPosition: "start",
    _initialized: false,
  });

  const serverState = ref<PrefsFields | null>(null);

  async function init() {
    if (state._initialized) return;
    const data = await $fetch("/api/user/preferences");
    serverState.value = data;
    Object.assign(state, data);
    state._initialized = true;
  }

  onNuxtReady(() => {
    callOnce(init);
  });

  const dirtyState = computed(() => {
    if (!serverState.value) return null;
    const dirty: Partial<PrefsFields> = {};
    for (const key of Object.keys(serverState.value) as (keyof PrefsFields)[]) {
      if (state[key] !== serverState.value[key]) {
        // @ts-expect-error - TS can't verify the keyof relationship but we know it's correct
        dirty[key] = state[key];
      }
    }
    return dirty;
  });

  watch(dirtyState, async () => {
    if (!dirtyState.value || !Object.keys(dirtyState.value).length) return;
    const response = await $fetch("/api/user/preferences", {
      method: "PATCH",
      body: dirtyState.value,
    });
    serverState.value = response;
  });

  return {
    ...toRefs(state),
  };
});
