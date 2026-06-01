/**
 * Tests for the PhotoSwipe info panel.
 *
 * Requirements:
 *   - Swiping up on the sticky header (when panel is open, not maximized)
 *     must maximize the panel (add pswp--info-maximized / data-info-maximized).
 */

import type { GenericMedia } from "@liase/core";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createAndRunQuery, setup } from "./helpers";

const VIEWPORT = { width: 800, height: 900 };

// Use a locally-served fixture image so it loads quickly and reliably in CI.
function makeLocalImageMedia(
  overrides: Partial<GenericMedia> = {},
): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  const fixtureServerUrl =
    process.env.TEST_FIXTURE_SERVER_URL ?? "http://127.0.0.1:0";
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `${fixtureServerUrl}/test-image.png`,
        video: false,
        audio: false,
        image: true,
        ext: "png",
        width: 200,
        height: 150,
      },
    ],
    ...overrides,
  };
}

/**
 * Simulate an upward swipe on the info-panel header by dispatching PointerEvents
 * with pointerType:"touch" directly via JS.  Synthetic events bypass the
 * browser's touch-action routing check, but they exercise the same JS handler
 * code that real touch events reach (once touch-action:none is set on the
 * header so the browser hands real touches to JS rather than scrolling).
 */
async function swipeUpOnHeader(page: Page, distancePx = 80) {
  await page.evaluate((dist) => {
    const header = document.querySelector(
      '[data-testid="pswp-info-panel-header"]',
    ) as HTMLElement | null;
    if (!header) throw new Error("pswp-info-panel-header element not found");

    const rect = header.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const fire = (type: string, x: number, y: number) =>
      header.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: 1,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );

    fire("pointerdown", cx, cy);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      fire("pointermove", cx, cy - Math.round((dist / steps) * i));
    }
    fire("pointerup", cx, cy - dist);
  }, distancePx);
}

/**
 * Simulate a downward swipe on the info-panel header.  Same synthetic approach
 * as swipeUpOnHeader — see comment above.
 */
async function swipeDownOnHeader(page: Page, distancePx = 80) {
  await page.evaluate((dist) => {
    const header = document.querySelector(
      '[data-testid="pswp-info-panel-header"]',
    ) as HTMLElement | null;
    if (!header) throw new Error("pswp-info-panel-header element not found");

    const rect = header.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const fire = (type: string, x: number, y: number) =>
      header.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: 1,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );

    fire("pointerdown", cx, cy);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      fire("pointermove", cx, cy + Math.round((dist / steps) * i));
    }
    fire("pointerup", cx, cy + dist);
  }, distancePx);
}

/** Returns the vertical centre of the visible slide image in viewport pixels. */
async function getSlideCenterY(page: Page): Promise<number> {
  const box = await page.locator(".pswp__img").first().boundingBox();
  if (!box) throw new Error("slide image not found");
  return box.y + box.height / 2;
}

/** Opens the lightbox on the first thumbnail and then opens the info panel. */
async function openLightboxAndPanel(page: Page) {
  await page.goto("/media/grid");
  const thumbnail = page.getByTestId("media-preview-thumbnail").first();
  await thumbnail.waitFor({ state: "visible", timeout: 15_000 });
  await thumbnail.click();
  await page.getByTestId("pswp").waitFor({ state: "visible", timeout: 5_000 });
  await page.getByTitle("Media info").click();
  await expect(page.getByTestId("pswp-info-panel")).toBeVisible({
    timeout: 3_000,
  });
  // Allow the open animation (300 ms) to settle so image position is stable.
  await page.waitForTimeout(400);
}

test.describe("PhotoSwipe info panel", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [[makeLocalImageMedia({ id: "info-panel-test-img" })]],
      },
    );
    await createAndRunQuery({ request });
  });

  test("swiping up on the header maximizes the panel", async ({ page }) => {
    // Navigate to the grid page, which embeds the PhotoSwipe lightbox.
    await page.goto("/media/grid");

    // Click the first media thumbnail to open PhotoSwipe.
    const thumbnail = page.getByTestId("media-preview-thumbnail").first();
    await thumbnail.waitFor({ state: "visible", timeout: 15_000 });
    await thumbnail.click();

    // Wait for PhotoSwipe to open.
    const pswp = page.getByTestId("pswp");
    await pswp.waitFor({ state: "visible", timeout: 5_000 });

    // Open the info panel via the toolbar info button.
    const infoBtn = page.getByTitle("Media info");
    await infoBtn.click();

    // Panel should be visible and open but NOT yet maximized.
    const panel = page.getByTestId("pswp-info-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });
    await expect(pswp).not.toHaveAttribute("data-info-maximized");

    // Swipe up on the sticky header.
    await swipeUpOnHeader(page, 80);

    // Panel should now be maximized.
    await expect(pswp).toHaveAttribute("data-info-maximized", {
      timeout: 2_000,
    });
  });

  test("dragging header down from non-maximized state closes the panel", async ({
    page,
  }) => {
    await openLightboxAndPanel(page);
    const pswp = page.getByTestId("pswp");
    await expect(pswp).not.toHaveAttribute("data-info-maximized");

    // 80 px downward drag on the header — well above the 60 px commit threshold.
    await swipeDownOnHeader(page, 80);

    await expect(pswp).not.toHaveClass(/pswp--info-open/, { timeout: 2_000 });
  });

  test("dragging header down from maximized and releasing in upper 2/3 un-maximizes and returns image to open-panel position", async ({
    page,
  }) => {
    await openLightboxAndPanel(page);
    const pswp = page.getByTestId("pswp");

    // Note image centre-Y with the panel open (non-maximized).
    const openCenterY = await getSlideCenterY(page);

    // Maximize the panel.
    await page.getByTitle("Expand").click();
    await expect(pswp).toHaveAttribute("data-info-maximized", {
      timeout: 2_000,
    });

    // Maximizing should not change the image position.
    const maxCenterY = await getSlideCenterY(page);
    expect(Math.abs(maxCenterY - openCenterY)).toBeLessThan(3);

    // Drag the header down 100 px.
    // When maximized, the panel fills the viewport and the header is sticky at
    // the very top (centre ≈ 22 px from top of a 900 px viewport).  Releasing at
    // ≈ 122 px is well inside the upper two-thirds (< 600 px), so the gesture
    // commits to un-maximize rather than close.
    await swipeDownOnHeader(page, 100);

    await expect(pswp).not.toHaveAttribute("data-info-maximized", {
      timeout: 2_000,
    });
    await expect(pswp).toHaveClass(/pswp--info-open/);

    // Wait for the spring animation (300 ms) to finish.
    await page.waitForTimeout(400);

    // Image should be back at the panel-open position, not displaced by the drag
    // (the drag was less than the image-moving threshold).
    const finalCenterY = await getSlideCenterY(page);
    expect(Math.abs(finalCenterY - openCenterY)).toBeLessThan(5);
  });

  test("dragging header down from maximized and releasing in lower 1/3 closes panel and restores full-screen image position", async ({
    page,
  }) => {
    await openLightboxAndPanel(page);
    const pswp = page.getByTestId("pswp");

    // Note image centre-Y with the panel open (image is shifted upward).
    const openCenterY = await getSlideCenterY(page);

    // Maximize the panel.
    await page.getByTitle("Expand").click();
    await expect(pswp).toHaveAttribute("data-info-maximized", {
      timeout: 2_000,
    });

    // Drag the header down 650 px.
    // Header starts at ≈ 22 px (top of maximized panel).  Releasing at ≈ 672 px
    // is past the lower-third threshold (900 * 2/3 = 600 px), so the gesture
    // commits to close rather than un-maximize.
    await swipeDownOnHeader(page, 650);

    await expect(pswp).not.toHaveClass(/pswp--info-open/, { timeout: 2_000 });

    // Wait for the close animation (250 ms) and spring (300 ms) to finish.
    await page.waitForTimeout(400);

    // With the panel closed the image should have returned to its full-screen
    // centred position, which is lower than the panel-open position.
    const finalCenterY = await getSlideCenterY(page);
    expect(finalCenterY).toBeGreaterThan(openCenterY + 10);
  });
});
