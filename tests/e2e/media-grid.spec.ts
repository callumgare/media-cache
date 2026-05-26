import type PhotoSwipe from "photoswipe";
import { expect, test } from "./fixtures";
import {
  collectConsoleProblems,
  createAndRunQuery,
  makeImageMedia,
  setup,
} from "./helpers";

// window.pswp is set by PhotoSwipe when it opens
declare global {
  interface Window {
    pswp?: PhotoSwipe;
  }
}

// ---------------------------------------------------------------------------
// Media grid – browsing and filtering
// ---------------------------------------------------------------------------

test.describe("Media grid – browsing and filtering", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "browse-1" }),
            makeImageMedia({ id: "browse-2" }),
            makeImageMedia({ id: "browse-3" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("displays media items and sidebar source filtering works correctly", async ({
    page,
  }) => {
    const problems = collectConsoleProblems(page);
    await page.goto("/media/grid");

    const items = page.locator("[data-media-id]");
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(items).toHaveCount(3, { timeout: 15_000 });

    // Open the source filter dropdown in the sidebar
    const sidebar = page.getByTestId("page-sidebar");
    const sourceSelect = sidebar
      .locator(".root", { has: page.locator("label", { hasText: "Source" }) })
      .locator(".p-select");
    await expect(sourceSelect).toBeVisible({ timeout: 5_000 });
    await sourceSelect.click();

    // Overlay lists available sources — confirm "Test Source" is present
    const overlay = page.locator(".p-select-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    const testSourceOption = overlay.locator(".p-select-option", {
      hasText: "Test Source",
    });
    await expect(testSourceOption).toBeVisible({ timeout: 5_000 });

    // Select the source; all 3 items are from test-source so count stays at 3
    await testSourceOption.click();
    await expect(items).toHaveCount(3, { timeout: 10_000 });

    expect(
      problems,
      "No console errors or warnings on media grid page",
    ).toEqual([]);
  });

  test("lightbox opens, supports arrow key navigation, and closes via backdrop click", async ({
    page,
  }) => {
    await page.goto("/media/grid");

    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    const counter = pswp.locator(".pswp__counter");
    await expect(counter).toContainText("1 /", { timeout: 5_000 });

    // Wait for PhotoSwipe opening animation to complete (bindEvents fires here,
    // registering keyboard and mouse handlers).
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    // Arrow key navigation
    await page.keyboard.press("ArrowRight");
    await expect(counter).toContainText("2 /", { timeout: 5_000 });

    await page.keyboard.press("ArrowLeft");
    await expect(counter).toContainText("1 /", { timeout: 5_000 });

    // Click the backdrop area to the left of the image to close the lightbox.
    // Viewport is 1280×720. The 800×600 image at fit-zoom 1.2 is rendered at
    // 960×720, left edge at x=160. We click at (80, 650): right of the arrow
    // button and below it, safely in the backdrop.
    await page.mouse.click(80, 650);
    await expect(pswp).not.toBeVisible({ timeout: 5_000 });
  });

  test("clicking the image in the lightbox zooms in", async ({ page }) => {
    await page.goto("/media/grid");

    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });

    // Wait for PhotoSwipe opening animation to complete before interacting.
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    // Wait until the image is loaded and isZoomable() returns true.
    // PhotoSwipe adds pswp--click-to-zoom once dimensions are known.
    await expect(pswp).toHaveClass(/pswp--click-to-zoom/, { timeout: 10_000 });

    // Click the centre of the image (640, 360 in a 1280×720 viewport) to zoom in.
    // The 800×600 image at fit-zoom 1.2 is rendered at 960×720, centred in the
    // viewport (x:160–1120), so (640, 360) is safely on the image.
    await page.mouse.click(640, 360);
    await expect(pswp).toHaveClass(/pswp--zoomed-in/, { timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Media grid – infinite scroll
// Page size is 10; seed 50 items (5 full pages) to test auto-fill and
// scroll-triggered loading separately.
// ---------------------------------------------------------------------------

test.describe("Media grid – infinite scroll", () => {
  const allMedia = Array.from({ length: 50 }, (_, i) =>
    makeImageMedia({ id: `scroll-${i + 1}` }),
  );

  // 800×600 fits roughly one page (10 items) without overflow
  test.use({ viewport: { width: 800, height: 600 } });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [allMedia] });
    await createAndRunQuery({ request });
  });

  /**
   * Intercepts /api/media so the next matching request is held until the
   * returned `release()` function is called. Subsequent requests pass through.
   */
  async function holdNextMediaRequest(page: import("@playwright/test").Page) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/media", async (route) => {
      await released;
      await route.continue();
      await page.unroute("**/api/media");
    });

    return release;
  }

  test("does not continuously load all pages without scrolling", async ({
    page,
  }) => {
    const release = await holdNextMediaRequest(page);
    await page.goto("/media/grid");

    const items = page.locator("[data-media-id]");
    const loadingIndicator = page.locator(".loading-placeholder").first();

    // First request is held — confirm loading indicator is visible
    await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });

    // Release the request and wait for loading to settle
    release();
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });

    // Wait to confirm auto-fill does not immediately trigger a second load.
    // 2 s gives the infinite-scroll observer enough time to fire on slow CI.
    await page.waitForTimeout(2_000);
    await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

    const count = await items.count();
    // Should have loaded at least 1 item but not all 50
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40);
  });

  test("scrolling to the bottom of the list loads the next page", async ({
    page,
  }) => {
    const releaseFirst = await holdNextMediaRequest(page);
    await page.goto("/media/grid");

    const items = page.locator("[data-media-id]");
    const loadingIndicator = page.locator(".loading-placeholder").first();

    // Release first request and wait for it to settle
    await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });
    releaseFirst();
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

    await expect(items).toHaveCount(10, { timeout: 5_000 });

    // Scroll to the bottom to trigger loading the next page.
    // useInfiniteScroll watches .base-layout-contents (the overflow container),
    // not .page (a non-scrolling descendant inside it).
    await page.evaluate(() => {
      const el = document.querySelector(".base-layout-contents");
      if (!el) throw new Error(".base-layout-contents element not found");
      el.scrollTop = el.scrollHeight;
    });

    await expect(items).toHaveCount(20, { timeout: 15_000 });
  });

  test("loading is triggered when viewport is enlarged to create free space", async ({
    page,
  }) => {
    // Override to a very short viewport so the first page of media overflows
    // the container, preventing auto-fill from loading more than one page.
    await page.setViewportSize({ width: 800, height: 150 });
    await page.goto("/media/grid");

    const items = page.locator("[data-media-id]");

    // Wait for the first page to load and auto-fill to fully settle.
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    const countBefore = await items.count();
    expect(countBefore).toBeGreaterThan(0);
    expect(countBefore).toBeLessThan(50);

    // Enlarge the viewport so all loaded items fit with room to spare.
    // Use the actual scrollHeight of the scroll container to ensure we
    // resize to something definitively larger than the current content.
    const contentHeight = await page.evaluate(
      () =>
        (document.querySelector(".page") as HTMLElement)?.scrollHeight ?? 2000,
    );
    await page.setViewportSize({ width: 800, height: contentHeight + 500 });

    // The infinite scroll should detect the extra space and load more items.
    await expect(items).not.toHaveCount(countBefore, { timeout: 10_000 });
    expect(await items.count()).toBeGreaterThan(countBefore);
  });
});
