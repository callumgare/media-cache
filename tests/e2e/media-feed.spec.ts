import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";
import {
  collectConsoleProblems,
  createAndRunQuery,
  makeImageMedia,
  makeVideoMedia,
  setup,
} from "./helpers";

const VIEWPORT = { width: 800, height: 800 };

// ---------------------------------------------------------------------------
// Helper: send a CDP touch swipe gesture so CSS scroll-snap fires correctly.
// ---------------------------------------------------------------------------
async function cdpTouchSwipe(
  page: import("@playwright/test").Page,
  fromY: number,
  toY: number,
) {
  const client = await page.context().newCDPSession(page);
  const x = Math.round(VIEWPORT.width / 2);
  const steps = 15;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x, y: fromY, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 },
    ],
  });
  for (let i = 1; i <= steps; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x,
          y: Math.round(fromY + (toY - fromY) * (i / steps)),
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 1,
        },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

// ---------------------------------------------------------------------------
// Image slide: rendering, fill-screen toggle, info overlay, preference persist
// ---------------------------------------------------------------------------

test.describe("Feed page – image slide", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({
              id: "img-1",
              title: "Test Media Title",
              tags: ["nature", "landscape"],
            } as Partial<GenericMedia>),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("renders correctly, fill-screen and info controls work as expected", async ({
    page,
  }) => {
    const problems = collectConsoleProblems(page);
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    // Slide fills the viewport
    const box = await firstSlide.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.height).toBeGreaterThanOrEqual(viewport.height - 5);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 5);
    }

    // is-current class and data-media-id attribute
    await expect(firstSlide).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(
      page.locator('[data-testid="feed-slide"][data-media-id]'),
    ).toHaveCount(1);

    // Image element with src pointing to /file/ route
    const img = firstSlide.getByTestId("feed-slide-image");
    await expect(img).toBeAttached({ timeout: 5_000 });
    expect(await img.getAttribute("src")).toMatch(/^\/file\//);

    // No progress bar for images
    await expect(
      firstSlide.getByTestId("feed-slide-progress"),
    ).not.toBeAttached();

    // Action buttons visible
    await expect(firstSlide.getByTestId("feed-slide-actions")).toBeVisible({
      timeout: 5_000,
    });

    // Fill-screen button: default is cover mode (search-plus icon, fill-screen class, not active)
    const fillScreenBtn = firstSlide.getByTestId("feed-slide-fill-screen-btn");
    await expect(fillScreenBtn).toBeVisible({ timeout: 5_000 });
    await expect(fillScreenBtn.locator(".pi-search-plus")).toBeAttached();
    await expect(fillScreenBtn.locator(".pi-search-minus")).not.toBeAttached();
    await expect(firstSlide).toHaveClass(/fill-screen/);
    await expect(fillScreenBtn).not.toHaveClass(/active/);

    // Click once → contain mode (search-minus icon, no fill-screen class, active)
    await fillScreenBtn.click();
    await expect(fillScreenBtn.locator(".pi-search-minus")).toBeAttached({
      timeout: 3_000,
    });
    await expect(fillScreenBtn.locator(".pi-search-plus")).not.toBeAttached();
    await expect(firstSlide).not.toHaveClass(/fill-screen/);
    await expect(fillScreenBtn).toHaveClass(/active/);

    // Click again → back to cover mode
    await fillScreenBtn.click();
    await expect(fillScreenBtn.locator(".pi-search-plus")).toBeAttached({
      timeout: 3_000,
    });
    await expect(firstSlide).toHaveClass(/fill-screen/);
    await expect(fillScreenBtn).not.toHaveClass(/active/);

    // Info overlay hidden by default
    await expect(
      firstSlide.getByTestId("feed-slide-info-overlay"),
    ).not.toBeAttached();

    // Click info → overlay with title and tags
    await firstSlide.getByTestId("feed-slide-info-btn").click();
    const overlay = firstSlide.getByTestId("feed-slide-info-overlay");
    await expect(overlay).toBeVisible({ timeout: 3_000 });
    await expect(overlay.getByTestId("media-info-title")).toHaveText(
      "Test Media Title",
    );
    await expect(overlay.getByTestId("media-info-tags")).toContainText(
      "nature",
    );
    await expect(overlay.getByTestId("media-info-tags")).toContainText(
      "landscape",
    );

    // Click info again → overlay hidden
    await firstSlide.getByTestId("feed-slide-info-btn").click();
    await expect(overlay).not.toBeVisible({ timeout: 3_000 });

    // No unexpected console errors
    expect(
      problems.filter(
        (p) =>
          !p.includes("net::ERR") &&
          !p.includes("Failed to load resource") &&
          !p.includes("MEDIA_ERR"),
      ),
      "No unexpected console errors on feed page",
    ).toEqual([]);
  });

  test("fill-screen preference persists across page reload", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    // Switch to contain mode
    const fillScreenBtn = firstSlide.getByTestId("feed-slide-fill-screen-btn");
    await fillScreenBtn.click();
    await expect(firstSlide).not.toHaveClass(/fill-screen/, { timeout: 3_000 });
    await expect(fillScreenBtn).toHaveClass(/active/);

    // Reload and verify preference persists
    await page.reload();
    const reloadedSlide = page.getByTestId("feed-slide").first();
    await expect(reloadedSlide).toBeVisible({ timeout: 15_000 });
    await expect(reloadedSlide).not.toHaveClass(/fill-screen/, {
      timeout: 5_000,
    });
    await expect(
      reloadedSlide.getByTestId("feed-slide-fill-screen-btn"),
    ).toHaveClass(/active/, { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Video slide: rendering, loop/mute controls, preference persistence
// ---------------------------------------------------------------------------

test.describe("Feed page – video slide", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeVideoMedia({ id: "vid-1" })]] });
    await createAndRunQuery({ request });
  });

  test("renders video slide with correct element and src", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(
      firstSlide.getByTestId("feed-slide-video-player"),
    ).toBeAttached({ timeout: 5_000 });
    const video = firstSlide.getByTestId("feed-slide-video");
    await expect(video).toBeAttached({ timeout: 5_000 });
    expect(await video.getAttribute("src")).toMatch(/^\/file\//);
  });

  test("loop and mute controls toggle correctly and preferences persist across reload", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const loopBtn = firstSlide.getByTestId("feed-slide-loop-btn");
    const muteBtn = firstSlide.getByTestId("feed-slide-mute-btn");
    const video = firstSlide.getByTestId("feed-slide-video");

    // Loop button: default not active
    await expect(loopBtn).toBeVisible({ timeout: 5_000 });
    await expect(loopBtn).not.toHaveClass(/active/);

    // Click → active, video gets loop attribute
    await loopBtn.click();
    await expect(loopBtn).toHaveClass(/active/, { timeout: 3_000 });
    await expect(video).toHaveAttribute("loop", { timeout: 3_000 });

    // Click again → deactivate, loop attribute removed
    await loopBtn.click();
    await expect(loopBtn).not.toHaveClass(/active/, { timeout: 3_000 });
    await expect(video).not.toHaveAttribute("loop");

    // Mute button: default is muted (volume-off icon, not active)
    await expect(muteBtn).toBeVisible({ timeout: 5_000 });
    await expect(muteBtn.locator(".pi-volume-off")).toBeAttached();
    await expect(muteBtn.locator(".pi-volume-up")).not.toBeAttached();
    await expect(muteBtn).not.toHaveClass(/active/);

    // Click → unmuted (volume-up icon, active, video.muted = false)
    await muteBtn.click();
    await expect(muteBtn.locator(".pi-volume-up")).toBeAttached({
      timeout: 3_000,
    });
    await expect(muteBtn.locator(".pi-volume-off")).not.toBeAttached();
    await expect(muteBtn).toHaveClass(/active/);
    await expect(video).toHaveJSProperty("muted", false, { timeout: 3_000 });

    // Click again → muted back
    await muteBtn.click();
    await expect(muteBtn).not.toHaveClass(/active/, { timeout: 3_000 });
    await expect(muteBtn.locator(".pi-volume-off")).toBeAttached();
    await expect(video).toHaveJSProperty("muted", true);

    // Set loop=on and unmuted, then reload to verify preferences persist
    await loopBtn.click(); // loop on
    await muteBtn.click(); // unmuted
    await expect(loopBtn).toHaveClass(/active/, { timeout: 3_000 });
    await expect(muteBtn).toHaveClass(/active/, { timeout: 3_000 });

    await page.reload();
    const reloadedSlide = page.getByTestId("feed-slide").first();
    await expect(reloadedSlide).toBeVisible({ timeout: 15_000 });
    await expect(reloadedSlide.getByTestId("feed-slide-loop-btn")).toHaveClass(
      /active/,
      { timeout: 5_000 },
    );
    await expect(reloadedSlide.getByTestId("feed-slide-mute-btn")).toHaveClass(
      /active/,
      { timeout: 5_000 },
    );
    await expect(
      reloadedSlide.getByTestId("feed-slide-video"),
    ).toHaveJSProperty("muted", false, { timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Navigation: view switcher and header chevron
// ---------------------------------------------------------------------------

test.describe("Feed page – navigation", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeImageMedia({ id: "nav-1" })]] });
    await createAndRunQuery({ request });
  });

  test("view switcher navigates to feed and chevron reveals the site header", async ({
    page,
  }) => {
    // Start on grid, switch to feed via the view switcher
    await page.goto("/media/grid");
    const switcher = page.getByTestId("media-view-switcher");
    await expect(switcher).toHaveAttribute("data-mounted", "true", {
      timeout: 50_000,
    });
    await switcher.getByRole("button").nth(1).click();
    await page.waitForTimeout(3_000);
    await expect(page).toHaveURL(/\/media\/feed/, { timeout: 30_000 });

    // Chevron reveals the header with the view switcher
    const chevron = page.getByTestId("feed-header-chevron");
    await expect(chevron).toBeVisible({ timeout: 5_000 });
    await chevron.click();
    await expect(page.getByTestId("media-view-switcher")).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe("Feed page – keyboard navigation", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "kbd-1" }),
            makeImageMedia({ id: "kbd-2" }),
            makeImageMedia({ id: "kbd-3" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("arrow keys navigate between slides and respect the start boundary", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // Slide 0 starts as current; slides 1+ are not
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);

    // ArrowDown → slide 1 becomes current and is scrolled into view
    await page.keyboard.press("ArrowDown");
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);
    const box = await slides.nth(1).boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(Math.abs(box.y)).toBeLessThanOrEqual(10);

    // ArrowUp → back to slide 0
    await page.keyboard.press("ArrowUp");
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);

    // ArrowUp again at first slide → no change (index does not go negative)
    await page.keyboard.press("ArrowUp");
    await expect(slides.nth(0)).toHaveClass(/is-current/);
  });
});

// ---------------------------------------------------------------------------
// Scroll / touch navigation (CSS scroll-snap + CDP touch events)
// The feed uses scroll-snap-type: y mandatory so that wheel and touch gestures
// snap to the next/previous slide natively in the browser compositor.
// ---------------------------------------------------------------------------

test.describe("Feed page – scroll and touch navigation", () => {
  // hasTouch: true lets Playwright treat drag as a touch gesture so that
  // CSS scroll-snap responds the same way a mobile browser does.
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "scroll-1" }),
            makeImageMedia({ id: "scroll-2" }),
            makeImageMedia({ id: "scroll-3" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("wheel scroll and touch swipe navigate between slides", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Wheel down → slide 1 is current and snapped to viewport top
    await page.mouse.wheel(0, VIEWPORT.height);
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);
    const box = await slides.nth(1).boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(Math.abs(box.y)).toBeLessThanOrEqual(10);

    // Wheel up → back to slide 0
    await page.mouse.wheel(0, -VIEWPORT.height);
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Touch swipe up (finger moves up = scroll forward) → slide 1
    // CDP is required so the compositor-level pan gesture and scroll-snap fire.
    await cdpTouchSwipe(
      page,
      Math.round(VIEWPORT.height * 0.7),
      Math.round(VIEWPORT.height * 0.3),
    );
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);

    // Touch swipe down (finger moves down = scroll back) → slide 0
    await cdpTouchSwipe(
      page,
      Math.round(VIEWPORT.height * 0.3),
      Math.round(VIEWPORT.height * 0.7),
    );
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });
});

// ---------------------------------------------------------------------------
// Infinite loading
// ---------------------------------------------------------------------------

test.describe("Feed page – infinite loading", () => {
  const TOTAL = 25; // 3 pages of 10 + remainder
  const allMedia = Array.from({ length: TOTAL }, (_, i) =>
    makeImageMedia({ id: `inf-${i + 1}` }),
  );

  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [allMedia] });
    await createAndRunQuery({ request });
  });

  test("navigating to the last loaded slide triggers loading the next page", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });

    // The virtualizer only renders visible + overscan items (~3-5), not all
    // loaded items at once. Record the initial rendered count.
    const initialCount = await slides.count();
    expect(initialCount).toBeGreaterThan(0);

    // Navigate forward until near the end of the initially rendered window,
    // which should trigger the next-page prefetch.
    for (let i = 0; i < Math.max(initialCount - 2, 1); i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(100);
    }

    // More slides should now be rendered as the next page loads
    await expect(slides).not.toHaveCount(initialCount, { timeout: 15_000 });
    const finalCount = await slides.count();
    expect(finalCount).toBeGreaterThan(initialCount);
  });
});
