import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Admin Browsing – gamepad mapping persisted to localStorage
//
// The bug: after SSR renders the page with null gamepadMapping (no cookie),
// pinia-plugin-persistedstate reads from localStorage on the client and patches
// the store. The text interpolation {{ uiState.gamepadMapping }} and computed
// selectedDescription both update correctly, but :class inside v-for does not.
// ---------------------------------------------------------------------------

test.describe("Admin Browsing – gamepad mapping selection", () => {
  test("card :class updates when gamepadMapping is loaded from localStorage after SSR hydration", async ({
    page,
  }) => {
    // Seed localStorage with a value that differs from the store's default
    // (dpad-arrows). The server renders with the default; the client must
    // override it after reading localStorage. This is where the bug manifests:
    // the :class inside v-for does not update even though the store value does.
    await page.addInitScript(() => {
      // pinia-plugin-persistedstate uses the store id ("ui") as the default key.
      localStorage.setItem(
        "ui",
        JSON.stringify({ gamepadMapping: "left-stick-arrows" }),
      );
    });

    await page.goto("/admin/browsing");

    // Wait for the cards to be rendered (hydration complete).
    await page.locator(".mapping-cards").waitFor();

    const leftStickCard = page
      .locator(".mapping-card")
      .filter({ hasText: "Left Stick" });
    const dpadCard = page.locator(".mapping-card").filter({ hasText: "D-pad" });

    await expect(
      leftStickCard,
      "Left Stick card should have selected class after localStorage hydration",
    ).toHaveClass(/selected/);

    await expect(
      dpadCard,
      "D-pad card (the store default) should not have selected class",
    ).not.toHaveClass(/selected/);
  });
});
