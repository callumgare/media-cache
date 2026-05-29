import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";
import {
  collectConsoleProblems,
  createAndRunQuery,
  makeImageMedia,
  makeVideoMedia,
  setup,
} from "./helpers";

declare global {
  interface Window {
    __currentSlideLeftViewport: boolean;
  }
}

const VIEWPORT = { width: 800, height: 800 };

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
    // Set up the waitForResponse listeners BEFORE each click so they capture
    // the resulting PATCH response before page.reload() can abort the request.
    const loopPrefSaved = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/user/preferences") &&
        resp.request().method() === "PATCH",
    );
    await loopBtn.click(); // loop on
    await loopPrefSaved;

    const mutePrefSaved = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/user/preferences") &&
        resp.request().method() === "PATCH",
    );
    await muteBtn.click(); // unmuted
    await mutePrefSaved;

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

  test("site header does not flash or slide during grid-to-feed navigation", async ({
    page,
  }) => {
    await page.goto("/media/grid");
    const switcher = page.getByTestId("media-view-switcher");
    await expect(switcher).toHaveAttribute("data-mounted", "true", {
      timeout: 50_000,
    });

    // Listen for a CSS transform transition starting on the hideable header
    // container.  The bug manifests as a "slide in" animation: the header is
    // first rendered in its COLLAPSED position (transform: translateY(-Xpx)),
    // then a 0.3s transition brings it back to translateY(0).
    //
    // When the fix (flush:'sync' watcher) is in place, both the `hideable` and
    // `expanded` CSS classes are applied in the same render batch, so the
    // element starts at translateY(0) and no meaningful transition fires.
    // Without the fix, the transition starts from the collapsed position
    // (rect.top is significantly negative) which we detect here.
    await page.evaluate(() => {
      (window as { __headerFlashDetected?: boolean }).__headerFlashDetected =
        false;
      document.addEventListener(
        "transitionstart",
        (e: TransitionEvent) => {
          const target = e.target as HTMLElement;
          if (
            target.classList.contains("hideable") &&
            e.propertyName === "transform"
          ) {
            // At transitionstart the element is still at the start position.
            // If the header container is above the viewport it was collapsed.
            const rect = target.getBoundingClientRect();
            if (rect.top < -5) {
              (
                window as { __headerFlashDetected?: boolean }
              ).__headerFlashDetected = true;
            }
          }
        },
        { capture: true },
      );
    });

    // Navigate to feed via the view switcher (SPA navigation)
    await switcher.getByRole("button").nth(1).click();
    await expect(page).toHaveURL(/\/media\/feed/, { timeout: 30_000 });
    await expect(page.getByTestId("feed-slide").first()).toBeVisible({
      timeout: 15_000,
    });

    const flashed = await page.evaluate(
      () =>
        (window as { __headerFlashDetected?: boolean }).__headerFlashDetected,
    );
    expect(
      flashed,
      "Site header must not animate in from collapsed state during navigation",
    ).toBe(false);
  });
  test("no Vue hydration errors when reloading feed after SPA navigation", async ({
    page,
  }) => {
    // Navigate from grid to feed via SPA — this sets history.state.back.
    await page.goto("/media/grid");
    const switcher = page.getByTestId("media-view-switcher");
    await expect(switcher).toHaveAttribute("data-mounted", "true", {
      timeout: 50_000,
    });
    await switcher.getByRole("button").nth(1).click();
    await expect(page).toHaveURL(/\/media\/feed/, { timeout: 30_000 });
    await expect(page.getByTestId("feed-slide").first()).toBeVisible({
      timeout: 15_000,
    });

    // Now reload — the server renders headerExpanded=false but without the fix
    // the client initialises to true (because history.state.back is set),
    // causing a Vue hydration mismatch warning.
    const hydrationWarnings: string[] = [];
    page.on("console", (msg) => {
      if (
        (msg.type() === "warning" || msg.type() === "error") &&
        msg.text().includes("Hydration")
      ) {
        hydrationWarnings.push(msg.text());
      }
    });

    await page.reload();
    await expect(page.getByTestId("feed-slide").first()).toBeVisible({
      timeout: 15_000,
    });

    expect(
      hydrationWarnings,
      "No Vue hydration warnings/errors should occur when reloading /media/feed after SPA navigation",
    ).toHaveLength(0);
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
// Scroll / touch navigation (CSS scroll-snap)
// The feed uses scroll-snap-type: y mandatory on the html element so that
// wheel and touch gestures snap to the next/previous slide.
// ---------------------------------------------------------------------------

test.describe("Feed page – scroll and touch navigation", () => {
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

    // Touch swipe up (finger moves up = scroll forward) → slide 1.
    // Programmatic scroll on document.documentElement (the scroll-snap root:
    // html:has(.slide-list) { scroll-snap-type: y mandatory }) reliably
    // triggers snap in headless Chromium; CDP touch events do not.
    await page.evaluate((h) => {
      document.documentElement.scrollBy({ top: h, behavior: "instant" });
    }, VIEWPORT.height);
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);

    // Touch swipe down (finger moves down = scroll back) → slide 0
    await page.evaluate((h) => {
      document.documentElement.scrollBy({ top: -h, behavior: "instant" });
    }, VIEWPORT.height);
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });

  test("partial wheel scroll snaps to a slide boundary", async ({ page }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Scroll 60 % of the viewport height — a partial amount that lands between
    // two snap points. With scroll-snap-type: y mandatory on the html element
    // the browser MUST snap to a slide boundary (scrollY = 0 or VIEWPORT.height).
    // Without scroll-snap the page would stop at ~480 px, failing the assertion.
    await page.mouse.wheel(0, Math.round(VIEWPORT.height * 0.6));

    // Wait for the snap animation to settle, then confirm scrollY is at a
    // snap point: a multiple of VIEWPORT.height within a 5 px tolerance.
    // Capture scrollY atomically inside waitForFunction (returning an object
    // so y=0 is not treated as falsy) to avoid a TOCTOU race where a
    // separate evaluate() call could read a changed scroll position.
    const resultHandle = await page.waitForFunction(
      (vh) => {
        const y = window.scrollY;
        const rem = y % vh;
        return rem <= 5 || rem >= vh - 5 ? { y } : null;
      },
      VIEWPORT.height,
      { timeout: 5_000 },
    );
    const { y: scrollY } = (await resultHandle.jsonValue()) as { y: number };

    const remainder = scrollY % VIEWPORT.height;
    expect(
      remainder <= 5 || remainder >= VIEWPORT.height - 5,
      `scrollY (${scrollY}) is not at a snap point — expected a multiple of ${VIEWPORT.height} px`,
    ).toBe(true);
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

// ---------------------------------------------------------------------------
// Responsive layout: slides resize with the viewport
// ---------------------------------------------------------------------------

test.describe("Feed page – responsive layout", () => {
  // 100 slides all returned on the first page (pageSize override). Being at
  // slide 99 puts scrollY = 99 * 800 = 79200; after growing to 1200 the target
  // is 99 * 1200 = 118800, which exceeds the old document height, exposing the
  // snap-point timing bug.
  const SLIDE_COUNT = 100;
  const slideMedia = Array.from({ length: SLIDE_COUNT }, (_, i) =>
    makeImageMedia({ id: `resize-slide-${i}` }),
  );

  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [slideMedia], pageSize: SLIDE_COUNT });
    await createAndRunQuery({ request });
  });

  test("slide height updates when viewport is resized", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    // Confirm initial height matches viewport
    const initialBox = await firstSlide.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox?.height).toBeCloseTo(VIEWPORT.height, -1);

    // Shrink the viewport height
    const newHeight = 500;
    await page.setViewportSize({ width: VIEWPORT.width, height: newHeight });

    // Slide should resize to match the new viewport height
    await expect(async () => {
      const box = await firstSlide.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height).toBeCloseTo(newHeight, -1);
    }).toPass({ timeout: 3_000 });
  });

  test("current slide is unchanged after viewport resize", async ({ page }) => {
    await page.goto("/media/feed");
    await expect(page.getByTestId("feed-slide").first()).toBeVisible({
      timeout: 15_000,
    });

    // Jump to a slide near the end of the list. Scroll-snap is briefly disabled
    // so the large programmatic jump isn't clamped to the last rendered snap
    // point. Two rAFs give the virtualizer time to re-render at the new position
    // before snap is restored.
    const lastIndex = SLIDE_COUNT - 5;
    const targetScrollY = lastIndex * VIEWPORT.height;
    await page.evaluate(async (targetY) => {
      const previousScrollSnapType =
        document.documentElement.style.scrollSnapType;
      document.documentElement.style.scrollSnapType = "none";
      window.scrollTo({ top: targetY, behavior: "instant" });
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      if (window.scrollY !== targetY) {
        throw new Error(
          `Scroll didn't reach targetY immediately; expected ${targetY} got ${window.scrollY}`,
        );
      }
      document.documentElement.style.scrollSnapType = previousScrollSnapType;
    }, targetScrollY);

    const currentSlide = page.locator(".is-current");
    await expect(currentSlide).toBeInViewport({ timeout: 5_000 });

    const idForCurrentSlideBeforeResize =
      await currentSlide.getAttribute("data-media-id");
    if (!idForCurrentSlideBeforeResize) {
      throw new Error("Could not get current slide id");
    }

    // Sweep the viewport height in small steps without pausing between steps,
    // simulating rapid window-edge dragging. Growing above the initial viewport
    // height is the critical case: without the fix the new target scrollY
    // (lastIndex * newHeight) exceeds the old document height, so the browser
    // clamps the scroll and the current slide leaves the viewport.
    //
    // Requests are sent concurrently (Promise.all) so the browser receives many
    // resize events before Vue has flushed any reactive updates, replicating the
    // real-world condition of fast window-edge dragging.
    const STEP = 10;
    async function sweepHeight(from: number, to: number) {
      const dir = to > from ? 1 : -1;
      const steps: Array<Promise<void>> = [];
      for (
        let h = from + dir * STEP;
        dir > 0 ? h <= to : h >= to;
        h += dir * STEP
      ) {
        steps.push(page.setViewportSize({ width: VIEWPORT.width, height: h }));
      }
      await Promise.all(steps);
    }

    // Track whether the current slide ever fully leaves the viewport.
    await page.evaluate(() => {
      const currentSlide = document.querySelector(".is-current");
      if (!currentSlide)
        throw new Error("No .is-current element found before resize");
      window.__currentSlideLeftViewport = false;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              window.__currentSlideLeftViewport = true;
            }
          }
        },
        { threshold: 0 },
      );
      observer.observe(currentSlide);
    });

    await sweepHeight(VIEWPORT.height, 200);
    await sweepHeight(200, 1200);

    expect(
      await page.evaluate(() => window.__currentSlideLeftViewport),
      "Current slide left the viewport during resize",
    ).toBe(false);

    await expect(currentSlide).toBeInViewport({ timeout: 5_000 });
    expect(await currentSlide.getAttribute("data-media-id")).toBe(
      idForCurrentSlideBeforeResize,
    );
  });
});

// ---------------------------------------------------------------------------
// Helper: simulate a tap that drifts a few pixels horizontally between press
// and release — the gesture that triggered the filterTaps regression.
// page.mouse is used because pointer/mouse events reliably synthesise a click
// after pointerup (unlike CDP touchEnd on a desktop browser), while still
// going through the same @use-gesture pointer-event handler that processes
// real touch drags.
// ---------------------------------------------------------------------------
async function wobblyMouseTap(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
  wobbleX = 3,
) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Move instantly (no steps) so the drift registers as high velocity — the
  // same condition that previously caused the gesture to be treated as a
  // leftward swipe, cancelling the button action.
  await page.mouse.move(x - wobbleX, y);
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Feed page – filter sidebar
// ---------------------------------------------------------------------------

test.describe("Feed page – filter sidebar", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeImageMedia({ id: "img-1" })]] });
    await createAndRunQuery({ request });
  });

  test("filter button opens sidebar on normal click", async ({ page }) => {
    await page.goto("/media/feed");
    const filterBtn = page.getByTestId("feed-slide-filter-btn");
    await expect(filterBtn).toBeVisible({ timeout: 15_000 });

    const sidebar = page.getByTestId("page-sidebar");
    await expect(sidebar).not.toBeInViewport();

    await filterBtn.click();

    await expect(sidebar).toBeInViewport({ timeout: 2_000 });
  });

  test("filter button opens sidebar even when tap drifts a few pixels horizontally", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const filterBtn = page.getByTestId("feed-slide-filter-btn");
    await expect(filterBtn).toBeVisible({ timeout: 15_000 });

    const sidebar = page.getByTestId("page-sidebar");
    await expect(sidebar).not.toBeInViewport();

    const box = await filterBtn.boundingBox();
    expect(box).not.toBeNull();
    if (!box)
      throw new Error("Should not be able to reach here when box is null");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 3 px leftward drift — small enough to be a tap but fast enough to
    // previously register as a swipe that cancelled the button action.
    await wobblyMouseTap(page, cx, cy, 3);

    await expect(sidebar).toBeInViewport({ timeout: 2_000 });
  });

  test("tags listbox allows selecting and deselecting an option", async ({
    page,
    request,
  }) => {
    // Re-seed with media that has tags so the Tags listbox has options
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({
              id: "tag-1",
              tags: ["nature"],
            } as Partial<GenericMedia>),
          ],
          [
            makeImageMedia({
              id: "tag-2",
              tags: ["nature", "animals"],
            } as Partial<GenericMedia>),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });

    await page.goto("/media/feed");
    const filterBtn = page.getByTestId("feed-slide-filter-btn");
    await expect(filterBtn).toBeVisible({ timeout: 15_000 });
    await filterBtn.click();

    const sidebar = page.getByTestId("page-sidebar");
    await expect(sidebar).toBeInViewport({ timeout: 2_000 });

    // Scope to the Tags input section (a .root div that contains the "Tags" label)
    const tagsSection = sidebar.locator(".root").filter({
      has: page.locator("label", { hasText: /^Tags$/ }),
    });

    // Wait for facets to load and the "nature" option to appear in the listbox
    const natureOption = tagsSection.locator(".p-listbox-option", {
      hasText: "nature",
    });
    await expect(natureOption).toBeVisible({ timeout: 10_000 });

    // Click "nature" to select it
    await natureOption.click();

    // It should now appear in the selected-items section above the list
    const natureSelectedItem = tagsSection.locator(".selected-item", {
      hasText: "nature",
    });
    await expect(natureSelectedItem).toBeVisible();

    // It should no longer appear in the unselected listbox
    await expect(natureOption).not.toBeVisible();

    // Click the selected item to deselect it
    await natureSelectedItem.click();

    // It should be back in the unselected listbox
    await expect(natureOption).toBeVisible();

    // The selected-items section should be empty again
    await expect(natureSelectedItem).not.toBeVisible();
  });

  test("tags listbox can be resized by dragging the handle", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({
              id: "tag-resize-1",
              tags: ["nature"],
            } as Partial<GenericMedia>),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });

    await page.goto("/media/feed");
    const filterBtn = page.getByTestId("feed-slide-filter-btn");
    await expect(filterBtn).toBeVisible({ timeout: 15_000 });
    await filterBtn.click();

    const sidebar = page.getByTestId("page-sidebar");
    await expect(sidebar).toBeInViewport({ timeout: 2_000 });

    const tagsSection = sidebar.locator(".root").filter({
      has: page.locator("label", { hasText: /^Tags$/ }),
    });

    // Wait for facets so the listbox is fully rendered
    await expect(
      tagsSection.locator(".p-listbox-option", { hasText: "nature" }),
    ).toBeVisible({ timeout: 10_000 });

    const listbox = tagsSection.locator(".p-listbox");
    const heightBefore = (await listbox.boundingBox())?.height;

    // Drag the resize handle down by 100px
    const handle = tagsSection.locator(".resize-handle");
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) throw new Error("resize-handle bounding box is null");

    const cx = handleBox.x + handleBox.width / 2;
    const cy = handleBox.y + handleBox.height / 2;

    // Dispatch mousedown on the specific handle element, then mousemove/mouseup on window.
    // (Playwright page.mouse cannot reliably hit-test through overflow:hidden wrappers.)
    await handle.evaluate(
      (el, { cx, cy }) =>
        el.dispatchEvent(
          new MouseEvent("mousedown", {
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        ),
      { cx, cy },
    );
    await page.evaluate(
      ({ cx, cy }) => {
        window.dispatchEvent(
          new MouseEvent("mousemove", {
            clientX: cx,
            clientY: cy + 100,
            bubbles: true,
          }),
        );
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      },
      { cx, cy },
    );

    const heightAfter = (await listbox.boundingBox())?.height;
    expect(heightAfter).toBeGreaterThan(heightBefore ?? 0);
  });
});

// ---------------------------------------------------------------------------
// Feed page – filter sidebar (touch gesture)
// The sidebar drag uses @vueuse/gesture's preventWindowScrollY option so that
// once a horizontal drag is recognised, subsequent touchmove events on the
// window are prevented — stopping the feed from scrolling vertically while
// the user is mid-gesture opening the sidebar.
// ---------------------------------------------------------------------------

test.describe("Feed page – filter sidebar touch gesture", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "sidebar-touch-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("starting a horizontal drag to open the sidebar prevents vertical scroll", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    await expect(page.getByTestId("feed-slide").first()).toBeVisible({
      timeout: 15_000,
    });

    // Simulate: finger down on the container, drag right (horizontal gesture
    // recognised), then check whether a touchmove on the window is prevented.
    //
    // The fix uses `preventWindowScrollY: true` on useDrag.  That makes the
    // library call setUpWindowScrollDetection on touchstart, which registers a
    // passive:false window touchmove listener.  Once horizontal movement is
    // confirmed, _dragPreventScroll=true causes that listener to call
    // preventDefault() on every subsequent touchmove — including vertical ones
    // that would otherwise scroll the feed.
    //
    // Without the fix the window listener is never registered, so
    // event.defaultPrevented stays false and the feed can scroll.
    const prevented = await page.evaluate(() => {
      const container = document.querySelector(".container") as HTMLElement;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;

      const makeTouch = (x: number, y: number) =>
        new Touch({
          identifier: 1,
          target: container,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });

      const dispatch = (
        el: EventTarget,
        type: string,
        x: number,
        y: number,
      ) => {
        const t = makeTouch(x, y);
        // targetTouches must be set explicitly — @vueuse/gesture reads
        // event.targetTouches (not event.touches) to extract clientX/clientY.
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type !== "touchend" ? [t] : [],
            targetTouches: type !== "touchend" ? [t] : [],
            changedTouches: [t],
          }),
        );
      };

      // Finger down, then drag right to trigger horizontal gesture recognition.
      dispatch(container, "touchstart", cx, cy);
      for (let i = 1; i <= 15; i++) {
        dispatch(container, "touchmove", cx + i * 8, cy);
      }

      // Dispatch a touchmove directly on the window (simulating finger
      // continuing to move, possibly vertically) and record whether it was
      // prevented.
      const t = makeTouch(cx + 120, cy - 40);
      const testEvent = new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [t],
        changedTouches: [t],
      });
      window.dispatchEvent(testEvent);

      dispatch(container, "touchend", cx + 120, cy - 40);
      return testEvent.defaultPrevented;
    });

    expect(
      prevented,
      "touchmove must be prevented while a horizontal sidebar drag is in progress",
    ).toBe(true);
  });
});
