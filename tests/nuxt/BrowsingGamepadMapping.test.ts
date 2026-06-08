import BrowsingPage from "@@/app/pages/admin/browsing.vue";
import { useUiState } from "@@/stores/ui";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { afterAll, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

const mockUserPreferences = reactive({
  loopVideo: false,
  muteVideo: true,
  videoFit: "cover",
});

vi.mock("@@/stores/user-preferences", () => ({
  useUserPreferences: () => mockUserPreferences,
}));

// Happy DOM doesn't implement the Gamepad API — provide a stub so the
// GamepadSettings component doesn't throw on mount.
vi.stubGlobal("navigator", {
  ...navigator,
  getGamepads: () => [],
});

// The pinia-persist-extended plugin accesses window.localStorage after
// app:suspense:resolve. Provide a no-op stub so those calls don't throw in
// Happy DOM.
const storageMock = {
  getItem: (_k: string) => null,
  setItem: (_k: string, _v: string) => {},
  removeItem: (_k: string) => {},
  clear: () => {},
  length: 0,
  key: (_i: number) => null,
};
if (typeof window !== "undefined") {
  try {
    Object.defineProperty(window, "localStorage", {
      value: storageMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: storageMock,
      configurable: true,
      writable: true,
    });
  } catch {
    // Non-configurable in this environment; ignore.
  }
}

const fetchStub = vi.fn((url: string, opts?: { method?: string }) => {
  if (url === "/api/user/preferences")
    return Promise.resolve({
      loopVideo: false,
      muteVideo: true,
      videoFit: "cover",
    });
  return Promise.reject(new Error(`Unexpected $fetch call: ${url}`));
}) as unknown as typeof fetch & {
  create: (options: unknown) => typeof fetchStub;
};
fetchStub.create = () => fetchStub;
vi.stubGlobal("$fetch", fetchStub);

afterAll(() => vi.unstubAllGlobals());

describe("Browsing page - gamepad mapping", () => {
  it("selected class on mapping card updates when gamepadMapping is patched externally", async () => {
    const wrapper = await mountSuspended(BrowsingPage);
    const uiState = useUiState();

    // Clear any loading flags so the 'selected' class condition is not gated.
    // In the Happy DOM test environment the app:suspense:resolve hook doesn't
    // fire (import.meta.client is false), so loading flags must be cleared
    // manually before asserting on the rendered UI.
    for (const key of Object.keys(uiState.loading)) {
      uiState.loading[key] = false;
    }
    await nextTick();

    // Start with null – the "None" card should be selected
    uiState.$patch({ gamepadMapping: null });
    await nextTick();
    await nextTick();

    const cards = wrapper.findAll(".mapping-card");
    // "None" is the last entry in allOptions ([...GAMEPAD_MAPPINGS, null])
    const noneCard = cards[cards.length - 1];
    if (!noneCard) throw new Error("Expected at least one .mapping-card");
    expect(noneCard.classes()).toContain("selected");

    // Simulate pinia-plugin-persistedstate patching from storage
    uiState.$patch({ gamepadMapping: "dpad-arrows" });
    await nextTick();

    // The "D-pad" card should now be selected, "None" should not
    const dpadCard = cards.find((c) => c.text().includes("D-pad"));
    expect(dpadCard?.classes(), "dpad card should be selected").toContain(
      "selected",
    );
    expect(
      noneCard.classes(),
      "none card should not be selected",
    ).not.toContain("selected");
  });
});
