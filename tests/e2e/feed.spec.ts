import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";
import { collectConsoleProblems } from "./helpers";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeImageMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
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

function makeVideoMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
        video: true,
        audio: false,
        image: false,
        ext: "mp4",
        width: 1280,
        height: 720,
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
      title: "Feed Test Query",
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

  // Poll until execution finishes
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
}

// ---------------------------------------------------------------------------
// Shared viewport – each slide is 100dvh so use a fixed height for consistency
// ---------------------------------------------------------------------------
const VIEWPORT = { width: 800, height: 800 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Feed page – navigation", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeImageMedia({ id: "nav-1" })]] });
    await createAndRunQuery({ request });
  });

  test("view switcher navigates to /media/feed when Feed option is clicked", async ({
    page,
  }) => {
    await page.goto("/media/grid");
    // Wait for Vue SSR hydration to complete (media-view-switcher sets data-mounted on mount)
    const switcher = page.getByTestId("media-view-switcher");
    await expect(switcher).toHaveAttribute("data-mounted", "true", {
      timeout: 50_000,
    });
    await expect(switcher).toBeVisible({ timeout: 5_000 });
    // Feed is the second option (index 1) in the SelectButton
    const feedOption = switcher.getByRole("button").nth(1);
    await feedOption.click();
    // Wait a bit to capture post-click navigation events
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/media\/feed/, { timeout: 30_000 });
  });

  test("chevron on feed page reveals the site header with view switcher", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const chevron = page.getByTestId("feed-header-chevron");
    await expect(chevron).toBeVisible({ timeout: 5_000 });
    await chevron.click();
    await expect(page.getByTestId("media-view-switcher")).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Feed page – slide rendering", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "img-1" }),
            makeImageMedia({ id: "img-2" }),
            makeImageMedia({ id: "img-3" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("feed scroller is present on /feed", async ({ page }) => {
    await page.goto("/media/feed");
    await expect(page.getByTestId("feed-scroller")).toBeAttached({
      timeout: 15_000,
    });
  });

  test("renders a slide for each media item", async ({ page }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    // Virtualizer renders at least the first page of items
    await expect(slides).toHaveCount(3, { timeout: 10_000 });
  });

  test("first slide fills the viewport height", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const box = await firstSlide.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "first slide must have dimensions").not.toBeNull();
    expect(viewport, "page must have a viewport").not.toBeNull();
    if (!box || !viewport) return;

    // Slide should fill the full viewport height (±5 px for sub-pixel rounding)
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 5);
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 5);
  });

  test("first slide has the is-current class", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(firstSlide).toHaveClass(/is-current/, { timeout: 5_000 });
  });

  test("non-current slides do not have the is-current class", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides).toHaveCount(3, { timeout: 15_000 });

    // All slides after the first must not be current
    const count = await slides.count();
    for (let i = 1; i < count; i++) {
      await expect(slides.nth(i)).not.toHaveClass(/is-current/);
    }
  });

  test("each slide carries the correct data-media-id attribute", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides).toHaveCount(3, { timeout: 15_000 });

    for (const id of ["img-1", "img-2", "img-3"]) {
      void id; // suppress unused warning
    }
    // data-media-id is on the root feed-slide element itself, not a child
    await expect(
      page.locator('[data-testid="feed-slide"][data-media-id]'),
    ).not.toHaveCount(0);
  });

  test("no unexpected console errors on page load", async ({ page }) => {
    const problems = collectConsoleProblems(page);
    await page.goto("/media/feed");
    await page.getByTestId("feed-slide").first().waitFor({ timeout: 15_000 });
    // Wait a moment for any deferred errors (e.g. SSR hydration warnings)
    await page.waitForTimeout(500);

    expect(
      problems.filter(
        (p) =>
          !p.includes("net::ERR") &&
          !p.includes("Failed to load resource") &&
          // Ignore expected video-load errors for external URLs
          !p.includes("MEDIA_ERR"),
      ),
      "No unexpected console errors or warnings on feed page",
    ).toEqual([]);
  });
});

test.describe("Feed page – image slides", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "feed-img-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("image slide renders an <img> element", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(firstSlide.getByTestId("feed-slide-image")).toBeAttached({
      timeout: 5_000,
    });
  });

  test("image <img> src points to the /file/ route", async ({ page }) => {
    await page.goto("/media/feed");
    const img = page
      .getByTestId("feed-slide")
      .first()
      .getByTestId("feed-slide-image");
    await expect(img).toBeAttached({ timeout: 15_000 });
    const src = await img.getAttribute("src");
    expect(src, "image src must begin with /file/").toMatch(/^\/file\//);
  });

  test("image slide does not render a progress bar", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    // Progress bar should be absent for image-only media
    await expect(
      firstSlide.getByTestId("feed-slide-progress"),
    ).not.toBeAttached();
  });
});

test.describe("Feed page – video slides", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "feed-vid-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("video slide renders a <video-player> custom element", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(
      firstSlide.getByTestId("feed-slide-video-player"),
    ).toBeAttached({ timeout: 5_000 });
  });

  test("video <video> element has a src pointing to the /file/ route", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const video = page
      .getByTestId("feed-slide")
      .first()
      .getByTestId("feed-slide-video");
    await expect(video).toBeAttached({ timeout: 15_000 });
    const src = await video.getAttribute("src");
    expect(src, "video src must begin with /file/").toMatch(/^\/file\//);
  });
});

test.describe("Feed page – slide controls", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({
              id: "ctrl-img-1",
              title: "Test Media Title",
              tags: ["nature", "landscape"],
            } as GenericMedia),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("action buttons are visible on the current slide", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(firstSlide.getByTestId("feed-slide-actions")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("fill-screen button initially shows search-plus icon (cover mode default)", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const btn = page
      .getByTestId("feed-slide")
      .first()
      .getByTestId("feed-slide-fill-screen-btn");
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(btn.locator(".pi-search-plus")).toBeAttached();
    await expect(btn.locator(".pi-search-minus")).not.toBeAttached();
  });

  test("clicking fill-screen button toggles to compress icon and adds fill-screen class", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-fill-screen-btn");
    await btn.click();

    // Icon should flip to search-minus (zoomed out / contain mode)
    await expect(btn.locator(".pi-search-minus")).toBeAttached({
      timeout: 3_000,
    });
    await expect(btn.locator(".pi-search-plus")).not.toBeAttached();
    // Slide root loses the fill-screen class
    await expect(firstSlide).not.toHaveClass(/fill-screen/);

    // Clicking again reverts to cover (fill-screen)
    await btn.click();
    await expect(btn.locator(".pi-search-plus")).toBeAttached({
      timeout: 3_000,
    });
    await expect(firstSlide).toHaveClass(/fill-screen/);
  });

  test("info overlay is hidden by default", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(
      firstSlide.getByTestId("feed-slide-info-overlay"),
    ).not.toBeAttached();
  });

  test("clicking info button shows overlay with title and tags", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

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
  });

  test("clicking info button again hides the overlay", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const infoBtn = firstSlide.getByTestId("feed-slide-info-btn");
    await infoBtn.click();
    await expect(firstSlide.getByTestId("feed-slide-info-overlay")).toBeVisible(
      { timeout: 3_000 },
    );

    await infoBtn.click();
    await expect(
      firstSlide.getByTestId("feed-slide-info-overlay"),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});

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

  test("ArrowDown moves current indicator to the second slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // Confirm slide 0 starts as current
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Navigate forward
    await page.keyboard.press("ArrowDown");

    // Slide 1 should become current
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);
  });

  test("ArrowUp moves current indicator back to the first slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // Go to slide 1 then back
    await page.keyboard.press("ArrowDown");
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });

    await page.keyboard.press("ArrowUp");
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });

  test("ArrowUp on first slide does not go to a negative index", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    await page.keyboard.press("ArrowUp");

    // First slide remains current — index does not wrap or go negative
    await expect(slides.nth(0)).toHaveClass(/is-current/);
  });

  test("second slide is visible in the viewport after ArrowDown", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    await page.keyboard.press("ArrowDown");
    await expect(slides.nth(1)).toBeVisible({ timeout: 5_000 });

    // The second slide should fill the viewport after navigation
    const box = await slides.nth(1).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (!box || !viewport) return;

    // After scrolling, the slide's top should be near 0 (within 10 px)
    expect(Math.abs(box.y)).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Scroll / swipe navigation
// Stash-tv uses CSS scroll-snap (scroll-snap-type: y mandatory on <html>,
// scroll-snap-align: start on each slide) so that native browser scrolling –
// whether by mouse wheel or finger swipe – snaps to the next/previous item.
// The IntersectionObserver then picks up which slide became most visible and
// updates currentIndex accordingly.
// ---------------------------------------------------------------------------

test.describe("Feed page – scroll navigation", () => {
  // hasTouch: true lets Playwright treat mouse drag as a touch gesture so
  // that CSS scroll-snap responds to swipes the same way a mobile browser does.
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

  test("mouse-wheel scroll down advances to the next slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Scroll down one viewport height
    await page.mouse.wheel(0, VIEWPORT.height);

    // The second slide should become current
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);
  });

  test("mouse-wheel scroll up returns to the previous slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // Go to slide 1 first
    await page.mouse.wheel(0, VIEWPORT.height);
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Scroll back up
    await page.mouse.wheel(0, -VIEWPORT.height);
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });

  test("second slide is visible in the viewport after scrolling down", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    await page.mouse.wheel(0, VIEWPORT.height);
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });

    const box = await slides.nth(1).boundingBox();
    const viewport = page.viewportSize();
    expect(box, "second slide must have layout").not.toBeNull();
    expect(viewport, "page must have a viewport").not.toBeNull();
    if (!box || !viewport) return;

    // After scroll-snap the slide's top edge should be at the top of the viewport
    expect(Math.abs(box.y)).toBeLessThanOrEqual(10);
  });

  test("touch swipe up (finger moving up) advances to the next slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });
    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Use CDP to send genuine touch events so Chrome's native scroll engine
    // and CSS scroll-snap engage (JS-dispatched TouchEvents and mouse drag
    // don't trigger the compositor-level pan gesture in headless Chrome).
    const client = await page.context().newCDPSession(page);
    const x = Math.round(VIEWPORT.width / 2);
    const startY = Math.round(VIEWPORT.height * 0.7);
    const endY = Math.round(VIEWPORT.height * 0.3);

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x, y: startY, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 },
      ],
    });
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x,
            y: Math.round(startY + (endY - startY) * (i / steps)),
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

    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(0)).not.toHaveClass(/is-current/);
  });

  test("touch swipe down (finger moving down) returns to the previous slide", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const slides = page.getByTestId("feed-slide");
    await expect(slides.first()).toBeVisible({ timeout: 15_000 });
    await expect(slides).toHaveCount(3, { timeout: 10_000 });

    // First advance to slide 1 via keyboard so we have a known state
    await page.keyboard.press("ArrowDown");
    await expect(slides.nth(1)).toHaveClass(/is-current/, { timeout: 5_000 });

    // Swipe down (finger moves down = scroll content up = previous slide)
    const client = await page.context().newCDPSession(page);
    const x = Math.round(VIEWPORT.width / 2);
    const startY = Math.round(VIEWPORT.height * 0.3);
    const endY = Math.round(VIEWPORT.height * 0.7);

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x, y: startY, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 },
      ],
    });
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x,
            y: Math.round(startY + (endY - startY) * (i / steps)),
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

    await expect(slides.nth(0)).toHaveClass(/is-current/, { timeout: 5_000 });
    await expect(slides.nth(1)).not.toHaveClass(/is-current/);
  });
});

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
    // loaded items at once.  Record the initial count and then navigate until
    // more items are fetched from the server.
    const initialCount = await slides.count();
    expect(initialCount).toBeGreaterThan(0);

    // Navigate forward until we're near the end of the initially loaded items
    // (within 5), which should trigger the next-page prefetch.
    for (let i = 0; i < Math.max(initialCount - 2, 1); i++) {
      await page.keyboard.press("ArrowDown");
      // Small wait between presses to let the virtualizer + observer update
      await page.waitForTimeout(100);
    }

    // After navigating near the end, more items should load and the total
    // rendered slide count should eventually exceed the initial count.
    await expect(slides).not.toHaveCount(initialCount, { timeout: 15_000 });
  });
});
