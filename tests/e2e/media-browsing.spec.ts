import { expect, test } from "@playwright/test";
import type { GenericMedia } from "media-finder";
import type PhotoSwipe from "photoswipe";

// window.pswp is set by the PhotoSwipeDebugPlugin when debug mode is on,
// and by registerMediaSwipe in MediaSwipe.vue.
declare global {
  interface Window {
    pswp?: PhotoSwipe;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    mediaFinderSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `https://picsum.photos/seed/${id}/800/600`,
        video: false,
        audio: false,
        image: true,
      },
    ],
    ...overrides,
  };
}

const TEST_REQUEST = { source: "test-source", queryType: "test-handler" };

async function setup(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: { media?: GenericMedia[][] } = {},
) {
  const res = await request.post("/api/_test/setup", {
    data: { media: opts.media ?? [] },
  });
  if (!res.ok())
    throw new Error(`Test setup failed: ${res.status()} ${await res.text()}`);
}

async function createAndRunQuery({
  request,
}: { request: import("@playwright/test").APIRequestContext }) {
  const createRes = await request.post("/api/admin/queries", {
    data: {
      title: "Browse Test Query",
      schedule: 0,
      requestOptions: TEST_REQUEST,
    },
  });
  if (!createRes.ok())
    throw new Error(
      `Failed to create query: ${createRes.status()} ${await createRes.text()}`,
    );
  const { id } = (await createRes.json()) as { id: number };

  const runRes = await request.post(`/api/admin/queries/${id}/run`);
  if (!runRes.ok())
    throw new Error(
      `Failed to run query: ${runRes.status()} ${await runRes.text()}`,
    );

  // Wait for the query execution to finish before returning
  await Promise.race([
    (async () => {
      while (true) {
        const tasksRes = await request.get("/api/tasks");
        if (!tasksRes.ok())
          throw new Error(`Failed to get tasks: ${tasksRes.status()}`);
        const tasks = (
          (await tasksRes.json()) as { json: Array<{ status: string }> }
        ).json;
        if (tasks.every((t) => t.status !== "running")) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for query execution")),
        30_000,
      ),
    ),
  ]);

  return { queryId: id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Browsing via media page grid", () => {
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

  test("use filters to filter media", async ({ page }) => {
    await page.goto("/");

    // Wait for media items to appear (all 3 from test-source)
    const items = page.locator("[data-media-id]");
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(items).toHaveCount(3, { timeout: 15_000 });

    // The sidebar source dropdown is populated from /api/admin/finder-details.
    // Target it via the QueryBuilderInputBase label text so we don't confuse it
    // with the tags or type dropdowns.
    const sidebar = page.getByTestId("page-sidebar");
    const sourceSelect = sidebar
      .locator(".root", { has: page.locator("label", { hasText: "Source" }) })
      .locator(".p-select");
    await expect(sourceSelect).toBeVisible({ timeout: 5_000 });
    await sourceSelect.click();

    // The overlay is teleported to <body> by PrimeVue.
    // Verify "Test Source" is present — this confirms finder-details returned sources.
    const overlay = page.locator(".p-select-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    const testSourceOption = overlay.locator(".p-select-option", {
      hasText: "Test Source",
    });
    await expect(testSourceOption).toBeVisible({ timeout: 5_000 });

    // Select the source to apply the filter
    await testSourceOption.click();

    // All 3 items are from test-source so the count should remain 3 after filtering
    await expect(items).toHaveCount(3, { timeout: 10_000 });
  });

  test.describe("Infinite scroll", () => {
    // Page size is 10; seed 50 items (5 full pages) so we can test both
    // auto-fill and scroll-triggered loading.
    const allMedia = Array.from({ length: 50 }, (_, i) =>
      makeImageMedia({ id: `scroll-${i + 1}` }),
    );

    // Fix viewport so results are consistent regardless of the runner's screen size.
    // 800×600 fits roughly one page (10 items) without overflow.
    test.use({ viewport: { width: 800, height: 600 } });

    test.beforeEach(async ({ request }) => {
      await setup({ request }, { media: [allMedia] });
      await createAndRunQuery({ request });
    });

    /**
     * Intercepts /api/media so the next matching request is held until the
     * returned `release()` function is called. Subsequent requests are passed
     * through normally.
     */
    async function holdNextMediaRequest(page: import("@playwright/test").Page) {
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });

      await page.route("**/api/media", async (route) => {
        // Wait until released, then forward the request
        await released;
        await route.continue();
        // Unroute so future requests pass through
        await page.unroute("**/api/media");
      });

      return release;
    }

    test("does not continuously load all pages without scrolling", async ({
      page,
    }) => {
      const release = await holdNextMediaRequest(page);
      await page.goto("/");

      const items = page.locator("[data-media-id]");
      const loadingIndicator = page.getByTestId("page").getByText("Loading...");

      // Request is held — confirm the loading indicator is visible
      await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });

      // Release the request and wait for loading to settle
      release();
      await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

      const count = await items.count();

      // Should have loaded at least 1 item but not all 50 — the auto-fill
      // should stop once the viewport is full.
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(40);
    });

    test("scrolling to the bottom of the list loads the next page", async ({
      page,
    }) => {
      const releaseFirst = await holdNextMediaRequest(page);
      await page.goto("/");

      const items = page.locator("[data-media-id]");
      const loadingIndicator = page.getByTestId("page").getByText("Loading...");

      // First request is held — confirm loading indicator is visible then release
      await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });
      releaseFirst();
      await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

      await expect(items).toHaveCount(10, { timeout: 5_000 });

      // Scroll to the bottom to trigger loading the next page
      await page.evaluate(() => {
        const el = document.querySelector(".page");
        if (!el) throw new Error(".page element not found");
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      // Second page should load and render
      await expect(items).toHaveCount(20, { timeout: 15_000 });
    });
  });
});

test.describe("Lightbox view", () => {
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

  test("clicking a media item opens it in the PhotoSwipe lightbox", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for media items to appear
    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });

    // Click the first media item
    await firstItem.click();

    // PhotoSwipe should open — it adds pswp--open to the root element
    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });
  });

  test("arrow keys navigate between slides", async ({ page }) => {
    await page.goto("/");

    // Wait for media items and open the lightbox on the first one
    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });

    // The slide counter text shows "1 / N"
    const counter = pswp.locator(".pswp__counter");
    await expect(counter).toContainText("1 /", { timeout: 5_000 });

    // PhotoSwipe only registers keyboard/mouse event handlers in its 'bindEvents' callback,
    // which fires on 'openingAnimationEnd' (after the ~333ms opening animation completes).
    // opener.isOpen is set to true just before openingAnimationEnd is dispatched (in the same
    // synchronous _onAnimationComplete() call), so it's a reliable signal that bindEvents fired.
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    // Press right arrow
    await page.keyboard.press("ArrowRight");
    await expect(counter).toContainText("2 /", { timeout: 5_000 });

    // Press left arrow — should go back to slide 1
    await page.keyboard.press("ArrowLeft");
    await expect(counter).toContainText("1 /", { timeout: 5_000 });
  });

  test("clicking the backdrop closes the lightbox", async ({ page }) => {
    await page.goto("/");

    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });

    // Wait for openingAnimationEnd (bindEvents fires here, registering mouse click handlers).
    // See the arrow-key test for a detailed explanation.
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    // Click in the backdrop area to the left of the centered image.
    // Viewport is 1280×720. The 800×600 image fits at zoom 1.2 → displayed 960×720,
    // left edge at x=160. The left backdrop is x:0-160.
    // The previous-slide arrow button occupies roughly x:0-75, y:330-390 (centred at y=360).
    // We click at (80, 650): right of the arrow button and well below it, safely in the backdrop.
    await page.mouse.click(80, 650);

    // Lightbox should close
    await expect(pswp).not.toBeVisible({ timeout: 5_000 });
  });

  test("clicking the image zooms in", async ({ page }) => {
    await page.goto("/");

    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });

    // Wait for openingAnimationEnd (bindEvents fires here, registering mouse click handlers).
    // See the arrow-key test for a detailed explanation.
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    // Wait for dimensions to be known (image loaded, isZoomable() returns true).
    // pswp--click-to-zoom is added by PhotoSwipe UI only once isZoomable() returns true,
    // which requires slide.width to be set (by the size-on-load plugin after image loads).
    await expect(pswp).toHaveClass(/pswp--click-to-zoom/, { timeout: 10_000 });

    // Click at the centre of the viewport (640, 360) where the image is displayed.
    // The 800×600 image at fit-zoom 1.2 is rendered at 960×720, centred in the 1280×720
    // viewport (x:160-1120, y:0-720), so (640,360) is safely on the image.
    // page.mouse.click fires at absolute viewport coordinates, bypassing any element-level
    // bounding-rect issues that arise from PhotoSwipe's CSS-transform-based positioning.
    await page.mouse.click(640, 360);
    await expect(pswp).toHaveClass(/pswp--zoomed-in/, { timeout: 3_000 });
  });
});
