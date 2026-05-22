/**
 * Tests for gamepad navigation on the feed page.
 *
 * The Gamepad API is mocked via page.addInitScript() so the mock is in place
 * before the Nuxt app boots and the polling composable (useGamepadPolling)
 * starts reading from navigator.getGamepads().
 *
 * The gamepad mapping is set directly on the Pinia store after the page loads
 * (via page.evaluate) to avoid depending on the exact storage format used by
 * pinia-plugin-persistedstate/nuxt.
 */

import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";
import { createAndRunQuery, makeImageMedia, setup } from "./helpers";

// Browser window shape exposed by the mock gamepad init script.
interface GamepadTestWindow {
  __pressGamepadButton: (index: number) => void;
  __releaseGamepadButton: (index: number) => void;
}

// Shape of the #__nuxt DOM element after Vue mounts.
interface NuxtRootElement extends HTMLElement {
  __vue_app__?: {
    config?: {
      globalProperties?: {
        $pinia?: {
          state?: { value?: { ui?: Record<string, unknown> } };
        };
      };
    };
  };
}

const VIEWPORT = { width: 800, height: 800 };

/**
 * Waits for two animation frames so the gamepad polling loop has time to
 * detect a press/release transition and dispatch the synthetic keyboard event.
 */
async function waitForGamepadPoll(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Injects a controllable mock Gamepad into the page before the app boots.
 * Overrides Navigator.prototype.getGamepads (more reliable than overriding the
 * navigator instance property in Chromium).
 * Exposes window.__pressGamepadButton(index) and
 * window.__releaseGamepadButton(index) for use in page.evaluate().
 */
async function injectMockGamepad(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));

    const mockGamepad = {
      id: "Mock Standard Gamepad (test)",
      index: 0,
      connected: true,
      timestamp: performance.now(),
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons,
      hapticActuators: [],
      vibrationActuator: null,
    };

    // Override on the prototype – direct property assignment on the navigator
    // instance is silently ignored in Chromium.
    Object.defineProperty(Navigator.prototype, "getGamepads", {
      configurable: true,
      value() {
        return [mockGamepad];
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as GamepadTestWindow).__pressGamepadButton = (
      index: number,
    ) => {
      buttons[index] = { pressed: true, touched: true, value: 1 };
      mockGamepad.timestamp = performance.now();
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as GamepadTestWindow).__releaseGamepadButton = (
      index: number,
    ) => {
      buttons[index] = { pressed: false, touched: false, value: 0 };
      mockGamepad.timestamp = performance.now();
    };
  });
}

/**
 * Sets the gamepadMapping directly on the Pinia ui store after the page has
 * loaded. This avoids depending on the exact storage format (cookie vs
 * localStorage) used by pinia-plugin-persistedstate/nuxt.
 */
async function setGamepadMapping(
  page: import("@playwright/test").Page,
  mappingId: string,
) {
  const ok = await page.evaluate((id) => {
    const vueApp = (document.querySelector("#__nuxt") as NuxtRootElement | null)
      ?.__vue_app__;
    const uiState = vueApp?.config?.globalProperties?.$pinia?.state?.value?.ui;
    if (!uiState) return false;
    uiState.gamepadMapping = id;
    return true;
  }, mappingId);
  if (!ok) throw new Error("Could not access Pinia ui store via Vue app");
}

async function pressGamepadButton(
  page: import("@playwright/test").Page,
  index: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(
    (i) => (window as unknown as GamepadTestWindow).__pressGamepadButton(i),
    index,
  );
}

async function releaseGamepadButton(
  page: import("@playwright/test").Page,
  index: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(
    (i) => (window as unknown as GamepadTestWindow).__releaseGamepadButton(i),
    index,
  );
}

// ---------------------------------------------------------------------------
// Feed – gamepad D-pad navigation
// ---------------------------------------------------------------------------

test.describe("Feed page – gamepad navigation", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "gp-1" } as Partial<GenericMedia>),
            makeImageMedia({ id: "gp-2" } as Partial<GenericMedia>),
            makeImageMedia({ id: "gp-3" } as Partial<GenericMedia>),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("D-pad Down / Up buttons navigate between slides", async ({ page }) => {
    // Must be added before any navigation so every page load gets the mock.
    await injectMockGamepad(page);

    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // Fire gamepadconnected so the gamepad.client.ts plugin calls start().
    // The listener is registered synchronously during Nuxt's client-plugin
    // phase, so it is in place by the time the slides are visible.
    await page.evaluate(() => {
      const event = new Event("gamepadconnected");
      Object.assign(event, { gamepad: navigator.getGamepads()[0] });
      window.dispatchEvent(event);
    });

    // Enable the dpad-arrows mapping now that the Vue app has booted.
    await setGamepadMapping(page, "dpad-arrows");

    // Slide 0 starts as current.
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);

    // Press D-pad Down (button 13) → slide 1 should become current.
    await pressGamepadButton(page, 13);
    await waitForGamepadPoll(page);
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);

    // Release so the next press is detected as a new transition.
    await releaseGamepadButton(page, 13);
    await waitForGamepadPoll(page);

    // Press D-pad Up (button 12) → back to slide 0.
    await pressGamepadButton(page, 12);
    await waitForGamepadPoll(page);
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });
});
