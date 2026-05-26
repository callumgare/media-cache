/**
 * Tests for pinch-to-zoom on the feed slide.
 *
 * Requirements:
 *   - Pinching out (spreading) past the threshold snaps to cover (fill-screen) mode.
 *   - Pinching in past the threshold snaps to contain mode.
 *   - A small pinch below the threshold leaves the zoom state unchanged.
 *   - While a pinch is in progress, the sidebar drag is suppressed.
 *   - While a pinch is in progress, the video hold (rate-change) gesture is cancelled.
 *   - While a pinch is in progress, the video tap (play/pause) gesture is cancelled.
 */

import type { GenericMedia } from "@liase/core";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// ── Test-data helpers ─────────────────────────────────────────────────────

function makeVideoMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  const fixtureServerUrl =
    process.env.TEST_FIXTURE_SERVER_URL ?? "http://127.0.0.1:0";
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `${fixtureServerUrl}/test-video.mp4`,
        video: true,
        audio: false,
        image: false,
        ext: "mp4",
        width: 320,
        height: 240,
      },
    ],
    ...overrides,
  };
}

const TEST_REQUEST = { source: "test-source", queryType: "test-handler" };
const VIEWPORT = { width: 800, height: 800 };

/**
 * Expected CSS scales for a 320×240 media in an 800×800 viewport:
 *  - natural:  scale = 320/800 = 0.4   (visual content = 320×240 px)
 *  - contain:  scale = 1.0             (visual content = 800×600 px)
 *  - cover:    scale = (800/240)/(800/320) ≈ 1.333 (fills container)
 */
const SCALE = {
  // 320×240 video or 200×150 image — all small media in 800×800 viewport
  VIDEO_NATURAL: 0.4,
  VIDEO_CONTAIN: 1.0,
  VIDEO_COVER: 800 / 240 / (800 / 320), // ≈ 1.333
  IMAGE_NATURAL: 200 / 800, // 0.25 — image is 200×150
  IMAGE_CONTAIN: 1.0,
  IMAGE_COVER: 800 / 150 / (800 / 200), // ≈ 1.333
} as const;

function makeHlsMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  const fixtureServerUrl =
    process.env.TEST_FIXTURE_SERVER_URL ?? "http://127.0.0.1:0";
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `${fixtureServerUrl}/hls/playlist.m3u8`,
        video: true,
        audio: false,
        image: false,
        ext: "m3u8",
        width: 320,
        height: 240,
      },
    ],
    ...overrides,
  };
}

function makeImageMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
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

function makeVideoTestMedia(
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
        url: `${fixtureServerUrl}/test-video.mp4`,
        video: true,
        audio: false,
        image: false,
        ext: "mp4",
        width: 320,
        height: 240,
      },
    ],
    ...overrides,
  };
}

async function setup(
  { request }: { request: APIRequestContext },
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
}: {
  request: APIRequestContext;
}) {
  const createRes = await request.post("/api/admin/queries", {
    data: {
      title: "Pinch Zoom Test Query",
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

/** Explicitly set the user's videoFit preference via the API. */
async function setVideoFit(
  { request }: { request: APIRequestContext },
  fit: "cover" | "contain",
) {
  const res = await request.patch("/api/user/preferences", {
    data: { videoFit: fit },
  });
  if (!res.ok())
    throw new Error(
      `Failed to set videoFit: ${res.status()} ${await res.text()}`,
    );
}

async function gotoFeedWithSlide(page: Page) {
  await page.goto("/media/feed");
  const slide = page.getByTestId("feed-slide").first();
  await slide.waitFor({ state: "visible", timeout: 40_000 });
  return { slide };
}

async function waitForVideoMetadata(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="feed-slide-video"]',
      ) as HTMLVideoElement | null;
      return el !== null && el.readyState >= 1;
    },
    { timeout: 15_000 },
  );
}

async function waitForImageLoad(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="feed-slide-image"]',
      ) as HTMLImageElement | null;
      return el?.complete && el.naturalWidth > 0;
    },
    { timeout: 15_000 },
  );
}

/**
 * Read the current scale from the CSS transform of the media element
 * identified by `testId`.  Returns 1 if no transform is set.
 */
async function getMediaScale(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector(
      `[data-testid="${id}"]`,
    ) as HTMLElement | null;
    if (!el) throw new Error(`No element with data-testid="${id}"`);
    const t = getComputedStyle(el).transform;
    const m = t.match(/matrix\(([^,]+)/);
    return m ? Number.parseFloat(m[1] ?? "1") : 1;
  }, testId);
}

/**
 * Wait until the media element's scale satisfies `condition`
 * (a serialisable expression evaluated in the browser with `s` as the scale).
 * Returns the scale value when the condition is met.
 */
async function waitForScaleWhere(
  page: Page,
  testId: string,
  /** A JS expression that evaluates to truthy when the condition is met. `s` is the scale. */
  condition: (s: number) => boolean,
  timeout = 5_000,
): Promise<number> {
  const condStr = condition.toString();
  const handle = await page.waitForFunction(
    ({ id, cond }) => {
      const el = document.querySelector(
        `[data-testid="${id}"]`,
      ) as HTMLElement | null;
      if (!el) return null;
      const t = getComputedStyle(el).transform;
      const m = t.match(/matrix\(([^,]+)/);
      const s = m ? Number.parseFloat(m[1] ?? "1") : 1;
      return new Function("s", `return (${cond})(s)`)(s) ? s : null;
    },
    { id: testId, cond: condStr },
    { timeout },
  );
  return (await handle.jsonValue()) as number;
}

async function pauseVideo(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    video.pause();
  });
}

async function isVideoPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    return video.paused;
  });
}

async function getMediaAreaBox(slide: Locator) {
  const box = await slide.getByTestId("feed-slide-media-area").boundingBox();
  if (!box) throw new Error("Cannot get feed-slide-media-area bounding box");
  return box;
}

/**
 * Dispatch a complete two-finger pinch gesture (touchstart → touchmove steps
 * → touchend) on the `[data-testid="feed-slide-media-area"]` element.
 *
 * Fingers are centred at `center` and spread horizontally.
 * `startSpread` and `endSpread` are the initial and final distances in px.
 */
async function simulatePinch(
  page: Page,
  center: { x: number; y: number },
  startSpread: number,
  endSpread: number,
  steps = 12,
) {
  await page.evaluate(
    ({ cx, cy, startSpread, endSpread, steps }) => {
      const target = document.querySelector(
        '[data-testid="feed-slide-media-area"]',
      ) as HTMLElement | null;
      if (!target) throw new Error("No feed-slide-media-area element");

      const makeTouch = (id: number, x: number, y: number) =>
        new Touch({
          identifier: id,
          target,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });

      const dispatch = (type: string, t1: Touch, t2: Touch) => {
        const isEnd = type === "touchend";
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: isEnd ? [] : [t1, t2],
            targetTouches: isEnd ? [] : [t1, t2],
            changedTouches: [t1, t2],
          }),
        );
      };

      dispatch(
        "touchstart",
        makeTouch(10, cx - startSpread / 2, cy),
        makeTouch(11, cx + startSpread / 2, cy),
      );
      for (let i = 1; i <= steps; i++) {
        const s = startSpread + (endSpread - startSpread) * (i / steps);
        dispatch(
          "touchmove",
          makeTouch(10, cx - s / 2, cy),
          makeTouch(11, cx + s / 2, cy),
        );
      }
      dispatch(
        "touchend",
        makeTouch(10, cx - endSpread / 2, cy),
        makeTouch(11, cx + endSpread / 2, cy),
      );
    },
    { cx: center.x, cy: center.y, startSpread, endSpread, steps },
  );
}

/**
 * Start a two-finger pinch gesture on the media area without releasing it.
 * Call `releasePinch` afterwards to fire the touchend.
 */
async function holdPinch(
  page: Page,
  center: { x: number; y: number },
  startSpread: number,
  endSpread: number,
  steps = 12,
) {
  await page.evaluate(
    ({ cx, cy, startSpread, endSpread, steps }) => {
      const target = document.querySelector(
        '[data-testid="feed-slide-media-area"]',
      ) as HTMLElement | null;
      if (!target) throw new Error("No feed-slide-media-area element");

      const makeTouch = (id: number, x: number, y: number) =>
        new Touch({
          identifier: id,
          target,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });

      target.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [
            makeTouch(10, cx - startSpread / 2, cy),
            makeTouch(11, cx + startSpread / 2, cy),
          ],
          targetTouches: [
            makeTouch(10, cx - startSpread / 2, cy),
            makeTouch(11, cx + startSpread / 2, cy),
          ],
          changedTouches: [
            makeTouch(10, cx - startSpread / 2, cy),
            makeTouch(11, cx + startSpread / 2, cy),
          ],
        }),
      );

      for (let i = 1; i <= steps; i++) {
        const s = startSpread + (endSpread - startSpread) * (i / steps);
        const t1 = makeTouch(10, cx - s / 2, cy);
        const t2 = makeTouch(11, cx + s / 2, cy);
        target.dispatchEvent(
          new TouchEvent("touchmove", {
            bubbles: true,
            cancelable: true,
            touches: [t1, t2],
            targetTouches: [t1, t2],
            changedTouches: [t1, t2],
          }),
        );
      }
      // No touchend — gesture remains held.
    },
    { cx: center.x, cy: center.y, startSpread, endSpread, steps },
  );
}

/** Fire touchend to release a held pinch gesture. */
async function releasePinch(
  page: Page,
  center: { x: number; y: number },
  endSpread: number,
) {
  await page.evaluate(
    ({ cx, cy, endSpread }) => {
      const target = document.querySelector(
        '[data-testid="feed-slide-media-area"]',
      ) as HTMLElement | null;
      if (!target) throw new Error("No feed-slide-media-area element");

      const makeTouch = (id: number, x: number, y: number) =>
        new Touch({
          identifier: id,
          target,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });

      target.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [
            makeTouch(10, cx - endSpread / 2, cy),
            makeTouch(11, cx + endSpread / 2, cy),
          ],
        }),
      );
    },
    { cx: center.x, cy: center.y, endSpread },
  );
}

/**
 * Dispatch additional touchmove events on top of a held pinch gesture,
 * smoothly translating the finger midpoint from `fromCenter` to `toCenter`
 * while keeping the spread constant.  Does not fire touchend.
 */
async function movePinch(
  page: Page,
  fromCenter: { x: number; y: number },
  toCenter: { x: number; y: number },
  spread: number,
  steps = 8,
) {
  await page.evaluate(
    ({ fromCx, fromCy, toCx, toCy, spread, steps }) => {
      const target = document.querySelector(
        '[data-testid="feed-slide-media-area"]',
      ) as HTMLElement | null;
      if (!target) throw new Error("No feed-slide-media-area element");

      const makeTouch = (id: number, x: number, y: number) =>
        new Touch({
          identifier: id,
          target,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const cx = fromCx + (toCx - fromCx) * t;
        const cy = fromCy + (toCy - fromCy) * t;
        const t1 = makeTouch(10, cx - spread / 2, cy);
        const t2 = makeTouch(11, cx + spread / 2, cy);
        target.dispatchEvent(
          new TouchEvent("touchmove", {
            bubbles: true,
            cancelable: true,
            touches: [t1, t2],
            targetTouches: [t1, t2],
            changedTouches: [t1, t2],
          }),
        );
      }
    },
    {
      fromCx: fromCenter.x,
      fromCy: fromCenter.y,
      toCx: toCenter.x,
      toCy: toCenter.y,
      spread,
      steps,
    },
  );
}

/**
 * Poll until the named media element's visual centre (via getBoundingClientRect)
 * is within `tolerance` pixels of `(expectedCx, expectedCy)`.
 * Handles CSS transition delays on the element.
 */
async function waitForMediaCenterNear(
  page: Page,
  testId: string,
  expectedCx: number,
  expectedCy: number,
  tolerance = 15,
  timeout = 3_000,
): Promise<void> {
  await page.waitForFunction(
    ([id, cx, cy, tol]: [string, number, number, number]) => {
      const el = document.querySelector(
        `[data-testid="${id}"]`,
      ) as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const actualCx = r.left + r.width / 2;
      const actualCy = r.top + r.height / 2;
      return Math.abs(actualCx - cx) < tol && Math.abs(actualCy - cy) < tol;
    },
    [testId, expectedCx, expectedCy, tolerance] as [
      string,
      number,
      number,
      number,
    ],
    { timeout },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Feed – pinch to zoom", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  // ── Zoom snapping ──────────────────────────────────────────────────────

  test.describe("zoom snapping", () => {
    test.beforeEach(async ({ request }) => {
      await setup(
        { request },
        { media: [[makeVideoMedia({ id: "pinch-snap-vid" })]] },
      );
      await createAndRunQuery({ request });
    });

    test("pinching out past the threshold snaps to cover (fill-screen) mode", async ({
      page,
      request,
    }) => {
      await setVideoFit({ request }, "contain");
      const { slide } = await gotoFeedWithSlide(page);
      await expect(slide).not.toHaveClass(/fill-screen/, { timeout: 2_000 });

      const box = await getMediaAreaBox(slide);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Spread from 50 → 200 px (4× scale — well past the 1.25× threshold)
      await simulatePinch(page, center, 50, 200);

      await expect(slide).toHaveClass(/fill-screen/, { timeout: 1_000 });
    });

    test("pinching in past the threshold snaps to contain mode", async ({
      page,
      request,
    }) => {
      await setVideoFit({ request }, "cover");
      const { slide } = await gotoFeedWithSlide(page);
      await expect(slide).toHaveClass(/fill-screen/, { timeout: 2_000 });

      const box = await getMediaAreaBox(slide);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Pinch from 200 → 50 px (0.25× scale — well past the 0.8× threshold)
      await simulatePinch(page, center, 200, 50);

      await expect(slide).not.toHaveClass(/fill-screen/, { timeout: 1_000 });
    });

    test("a small pinch below the threshold does not change the zoom state", async ({
      page,
      request,
    }) => {
      await setVideoFit({ request }, "contain");
      const { slide } = await gotoFeedWithSlide(page);
      await expect(slide).not.toHaveClass(/fill-screen/, { timeout: 2_000 });

      const box = await getMediaAreaBox(slide);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Spread from 100 → 115 px (1.15× scale — below the 1.25× threshold)
      await simulatePinch(page, center, 100, 115);

      // Must remain in contain mode
      await expect(slide).not.toHaveClass(/fill-screen/);
    });
  });

  // ── Gesture isolation ──────────────────────────────────────────────────

  test.describe("gesture isolation during pinch", () => {
    test.beforeEach(async ({ request }) => {
      await setup(
        { request },
        { media: [[makeVideoMedia({ id: "pinch-isolation-vid" })]] },
      );
      await createAndRunQuery({ request });
    });

    test("pinching does not open the sidebar", async ({ page }) => {
      const { slide } = await gotoFeedWithSlide(page);
      const sidebar = page.getByTestId("page-sidebar");
      await expect(sidebar).not.toBeInViewport();

      const box = await getMediaAreaBox(slide);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      // Simulate the realistic multi-touch sequence:
      //   1. First finger down (single-touch touchstart) — starts the sidebar drag.
      //   2. Second finger added (two-touch touchstart) — pinch detected; with the
      //      fix this calls stopPropagation so the sidebar never receives subsequent
      //      events.
      //   3. Both fingers move to the right — the direction that would open the
      //      sidebar if the touchmove events were allowed to propagate.
      await page.evaluate(
        ({ cx, cy, rightOffset, steps }) => {
          const target = document.querySelector(
            '[data-testid="feed-slide-media-area"]',
          ) as HTMLElement | null;
          if (!target) throw new Error("No feed-slide-media-area element");

          // Touch 10 stays at the same x throughout; touch 11 is added in step 2.
          const spread = 80;
          const makeTouch = (id: number, x: number, y: number) =>
            new Touch({
              identifier: id,
              target,
              clientX: x,
              clientY: y,
              radiusX: 2.5,
              radiusY: 2.5,
              rotationAngle: 0,
              force: 1,
            });

          // Step 1 – single-finger touchstart; sidebar drag starts tracking touch 10
          const t10_start = makeTouch(10, cx, cy);
          target.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [t10_start],
              targetTouches: [t10_start],
              changedTouches: [t10_start],
            }),
          );

          // Step 2 – second finger arrives; pinch is now in progress
          const t10_2 = makeTouch(10, cx, cy);
          const t11_2 = makeTouch(11, cx + spread, cy);
          target.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [t10_2, t11_2],
              targetTouches: [t10_2, t11_2],
              changedTouches: [t11_2],
            }),
          );

          // Step 3 – move both fingers rightward (would open sidebar without fix)
          for (let i = 1; i <= steps; i++) {
            const dx = (rightOffset * i) / steps;
            const ta = makeTouch(10, cx + dx, cy);
            const tb = makeTouch(11, cx + spread + dx, cy);
            target.dispatchEvent(
              new TouchEvent("touchmove", {
                bubbles: true,
                cancelable: true,
                touches: [ta, tb],
                targetTouches: [ta, tb],
                changedTouches: [ta, tb],
              }),
            );
          }

          // Touchend
          const te10 = makeTouch(10, cx + rightOffset, cy);
          const te11 = makeTouch(11, cx + spread + rightOffset, cy);
          target.dispatchEvent(
            new TouchEvent("touchend", {
              bubbles: true,
              cancelable: true,
              touches: [],
              targetTouches: [],
              changedTouches: [te10, te11],
            }),
          );
        },
        { cx, cy, rightOffset: 400, steps: 20 },
      );

      // Sidebar must remain closed
      await expect(sidebar).not.toBeInViewport();
    });

    test("pinching cancels the video hold (rate-change) gesture", async ({
      page,
    }) => {
      const { slide } = await gotoFeedWithSlide(page);
      await waitForVideoMetadata(page);

      const box = await getMediaAreaBox(slide);
      // Right zone centre (5/6 of the width) — same as the fast-forward gesture
      const x = box.x + (box.width * 5) / 6;
      const y = box.y + box.height / 2;

      // Fire a pointerdown to start the hold timer in the video gesture
      await page.mouse.move(x, y);
      await page.mouse.down();

      // Immediately add a second finger on the .zones element (simulates a
      // pinch arriving while the hold timer is still pending).
      // This fires onTouchStart on .zones → cleanupGesture() cancels the timer.
      await page.evaluate(
        ({ x, y, spread }) => {
          const target = document.querySelector(".zones") as HTMLElement | null;
          if (!target) throw new Error("No .zones element found");
          const makeTouch = (id: number, cx: number, cy: number) =>
            new Touch({
              identifier: id,
              target,
              clientX: cx,
              clientY: cy,
              radiusX: 2.5,
              radiusY: 2.5,
              rotationAngle: 0,
              force: 1,
            });
          const t1 = makeTouch(10, x - spread / 2, y);
          const t2 = makeTouch(11, x + spread / 2, y);
          target.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [t1, t2],
              targetTouches: [t1, t2],
              changedTouches: [t1, t2],
            }),
          );
        },
        { x, y, spread: 80 },
      );

      // Wait well past the 250 ms hold threshold — the rate indicator must
      // NOT appear because the hold gesture was cancelled by the pinch.
      await page.waitForTimeout(400);

      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).not.toBeVisible();

      await page.mouse.up();
    });

    test("pinching cancels the video tap (play/pause) gesture", async ({
      page,
    }) => {
      const { slide } = await gotoFeedWithSlide(page);
      await waitForVideoMetadata(page);

      // Ensure video is paused so we can detect an unwanted play action
      await pauseVideo(page);
      expect(await isVideoPaused(page)).toBe(true);

      const box = await getMediaAreaBox(slide);
      // Middle zone — tapping here toggles play/pause
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      // Fire a pointerdown on the middle zone to start the tap sequence
      await page.mouse.move(x, y);
      await page.mouse.down();

      // Simulate a second finger arriving before pointerup (pinch detected).
      // onTouchStart on .zones detects 2 touches → cleanupGesture() so that
      // the subsequent pointerup does not trigger a tap action.
      await page.evaluate(
        ({ x, y, spread }) => {
          const target = document.querySelector(".zones") as HTMLElement | null;
          if (!target) throw new Error("No .zones element found");
          const makeTouch = (id: number, cx: number, cy: number) =>
            new Touch({
              identifier: id,
              target,
              clientX: cx,
              clientY: cy,
              radiusX: 2.5,
              radiusY: 2.5,
              rotationAngle: 0,
              force: 1,
            });
          const t1 = makeTouch(10, x - spread / 2, y);
          const t2 = makeTouch(11, x + spread / 2, y);
          target.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [t1, t2],
              targetTouches: [t1, t2],
              changedTouches: [t1, t2],
            }),
          );
        },
        { x, y, spread: 80 },
      );

      // Release the pointer — without the fix this would play the video
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Video must remain paused — the tap gesture was cancelled by the pinch
      expect(await isVideoPaused(page)).toBe(true);
    });
  });

  // ── Visual behaviour during pinch ─────────────────────────────────────

  test.describe("visual behaviour during pinch", () => {
    test.beforeEach(async ({ request }) => {
      await setup(
        { request },
        { media: [[makeVideoMedia({ id: "pinch-visual-vid" })]] },
      );
      await createAndRunQuery({ request });
    });

    test("media shows uncropped content while a pinch-out gesture is held", async ({
      page,
      request,
    }) => {
      // Start in cover (fill-screen) mode.
      await setVideoFit({ request }, "cover");
      const { slide } = await gotoFeedWithSlide(page);
      await expect(slide).toHaveClass(/fill-screen/, { timeout: 2_000 });
      await waitForVideoMetadata(page);

      const box = await getMediaAreaBox(slide);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Wait for the cover scale to be applied.  The transform may not be
      // set immediately when loadedmetadata fires — poll until it appears.
      // The video fixture (320 × 240, 4:3) in an 800 × 800 viewport gives
      // coverRatio = 800/240 / (800/320) ≈ 1.333.
      const coverScaleHandle = await page.waitForFunction(
        () => {
          const video = document.querySelector(
            '[data-testid="feed-slide-video"]',
          ) as HTMLElement | null;
          if (!video) return null;
          const t = getComputedStyle(video).transform;
          // CSS matrix: matrix(a, b, c, d, e, f) — a is the x scale factor.
          const m = t.match(/matrix\(([^,]+)/);
          const scale = m ? Number.parseFloat(m[1] ?? "1") : 1;
          return scale > 1.05 ? scale : null;
        },
        undefined,
        { timeout: 5_000 },
      );
      const coverScale =
        (await coverScaleHandle.jsonValue()) as unknown as number;
      expect(coverScale).toBeGreaterThan(1.05);

      // Start a pinch-out gesture but keep it held (no touchend).
      // 200 → 170 px = 0.85× relative — below the 0.8 snap threshold, so
      // the slide stays in fill-screen mode throughout.
      await holdPinch(page, center, 200, 170);

      // Immediately after the gesture starts the scale must still be ≥ the
      // cover scale, not 1.0.  A value of 1.0 here would prove the old "jump
      // to object-fit: contain at scale 1" bug.
      const scaleDuringPinch = await page.evaluate(() => {
        const video = document.querySelector(
          '[data-testid="feed-slide-video"]',
        ) as HTMLElement | null;
        if (!video) throw new Error("No feed-slide-video element");
        const t = getComputedStyle(video).transform;
        const m = t.match(/matrix\(([^,]+)/);
        return m ? Number.parseFloat(m[1] ?? "1") : 1;
      });

      // Scale should be close to coverScale * 0.85 — definitely greater than 1.
      // Before the fix it would jump to 1.0 (the contain scale).
      expect(scaleDuringPinch).toBeGreaterThan(1.0);

      // Release — gesture stays below snap threshold → slide keeps fill-screen.
      await releasePinch(page, center, 170);
      await expect(slide).toHaveClass(/fill-screen/, { timeout: 1_000 });

      // After release, snaps back to coverScale.
      const scaleAfterRelease = await page.evaluate(() => {
        const video = document.querySelector(
          '[data-testid="feed-slide-video"]',
        ) as HTMLElement | null;
        if (!video) throw new Error("No feed-slide-video element");
        const t = getComputedStyle(video).transform;
        const m = t.match(/matrix\(([^,]+)/);
        return m ? Number.parseFloat(m[1] ?? "1") : 1;
      });
      // Allow for the 200 ms snap animation — value should be back near cover.
      expect(scaleAfterRelease).toBeGreaterThan(1.0);
    });
  });
});

// ── Scroll behaviour ──────────────────────────────────────────────────────
//
// Single-touch swipes on the media area must NOT block the browser's native
// CSS scroll-snap navigation between slides.  The root cause of breakage is
// `touch-action: none` on the video element (the browser default when the
// property isn't explicitly set), which suppresses ALL touch-based scrolling.
//
// Fix: set `touch-action: pan-y` on the media element in initTransform so the
// browser is free to handle vertical swipes while we still intercept 2-touch pinches.

test.describe("Feed – scroll: single-touch must not block native navigation", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "scroll-video-vid" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("video element touch-action allows vertical scroll", async ({
    page,
  }) => {
    await gotoFeedWithSlide(page);
    await waitForVideoMetadata(page);

    // Wait for initTransform to run (it sets inline style on the element).
    await page.waitForFunction(
      () => document.querySelector('[data-testid="feed-slide-video"]') !== null,
      { timeout: 5_000 },
    );

    // initTransform sets `el.style.touchAction = 'pan-y'` (inline).  If the value
    // is 'none' the browser refuses to scroll when the user swipes anywhere over
    // the video, breaking slide-to-slide navigation.
    const { videoTouchAction, parentTouchAction } = await page.evaluate(() => {
      const video = document.querySelector(
        '[data-testid="feed-slide-video"]',
      ) as HTMLElement | null;
      if (!video) throw new Error("No feed-slide-video element");
      return {
        videoTouchAction: video.style.touchAction,
        parentTouchAction:
          (video.parentElement as HTMLElement | null)?.style.touchAction ?? "",
      };
    });

    // Neither the video element nor its direct parent should block all touch.
    expect(
      videoTouchAction,
      "video inline touch-action must not be 'none'",
    ).not.toBe("none");
    expect(
      parentTouchAction,
      "video parent inline touch-action must not be 'none'",
    ).not.toBe("none");
  });
});

// ── Unlimited zoom during pinch ───────────────────────────────────────────
//
// While a pinch gesture is in progress the zoom has no hard upper or lower
// limit — the media should scale proportionally to finger spread.  Snap
// decisions (which preset level to land on) happen only when the gesture ends.
//
// The current implementation clamps scale to [SCALE_CLAMP_MIN, SCALE_CLAMP_MAX]
// (0.25 – 4) throughout the gesture.  These constants must be removed so that
// e.g. a 15× spread (20 → 300 px) can produce a scale ≥ 10 during the gesture.

test.describe("Feed – unlimited zoom during pinch gesture", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "unlimited-zoom-vid" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("pinching can zoom much further than the cover amount (standard video)", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForVideoMetadata(page);

    // Wait for initTransform to run: it sets inline touch-action and
    // style.transform on the media element.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="feed-slide-video"]',
        ) as HTMLElement | null;
        return el !== null && el.style.transform !== "";
      },
      { timeout: 5_000 },
    );

    const box = await getMediaAreaBox(slide);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Spread from 20 → 300 px = 15× scale.
    // Poll until the scale updates rather than reading it synchronously.
    await holdPinch(page, center, 20, 300);

    // Poll until the scale updates, then capture it while the pinch is
    // still held (before releasePinch fires touchend).
    const scaleDuringPinch = await waitForScaleWhere(
      page,
      "feed-slide-video",
      // Must be above the cover ratio (≈1.333) and beyond the old cap (4).
      (s) => s > 2,
      5_000,
    );

    expect(scaleDuringPinch).toBeGreaterThan(5);

    await releasePinch(page, center, 300);
  });
});

// ── Three-level zoom (natural / contain / cover) ──────────────────────────
//
// When the media's natural size is SMALLER than it would appear at "contain"
// zoom (i.e. naturalWidth < containerWidth for the limiting dimension), a third
// "natural size" zoom level is available below "contain".
//
// Requirements:
//  • The three preset levels are: natural-size, contain, cover.
//  • The zoom button is INACTIVE only in fill-screen (cover) mode.
//  • The zoom button is ACTIVE at every other level (contain and natural).
//  • Clicking the button advances to the next level in order; from the last
//    level it wraps back to the smallest (and becomes inactive again).
//
// All three media types (standard video, HLS video, image) are tested because
// each uses a different rendering path (plain <video>, <hls-video>, <img>).

// ─── Helpers shared across the three-level tests ──────────────────────────

/**
 * Wait for the media area element to expose a `data-natural-size` attribute,
 * which is set by FeedSlide.vue once the natural media dimensions are known.
 * This is necessary for HLS video where `videoWidth` may be 0 at
 * `loadedmetadata` time and only becomes available after the first segment.
 */
async function waitForNaturalSize(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="feed-slide-media-area"]',
      ) as HTMLElement | null;
      return el !== null && !!el.dataset.naturalSize;
    },
    { timeout: 10_000 },
  );
}

/**
 * Click the zoom button.
 */
async function clickZoomButton(page: Page, slide: Locator) {
  const btn = slide.getByTestId("feed-slide-fill-screen-btn");
  await btn.click();
}

async function isZoomButtonActive(
  page: Page,
  slide: Locator,
): Promise<boolean> {
  const btn = slide.getByTestId("feed-slide-fill-screen-btn");
  const classes = (await btn.getAttribute("class")) ?? "";
  return classes.split(" ").includes("active");
}

// ─── Standard video (320×240) ─────────────────────────────────────────────

test.describe("Feed – zoom levels: standard video (320×240, 3 levels)", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoTestMedia({ id: "zoom-levels-vid" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("zoom button cycles contain → cover → natural → contain", async ({
    page,
    request,
  }) => {
    // Start at contain (valid current API value, corresponds to the middle level).
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForVideoMetadata(page);

    // ── Step 0: contain ──────────────────────────────────────────────────
    // Scale should reach ≈ 1.0 after media loads.
    await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.0) < 0.15,
    );
    // Wait for the component to detect natural dimensions before cycling.
    await waitForNaturalSize(page);
    // Button must be ACTIVE at contain.
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // ── Step 1: contain → cover ──────────────────────────────────────────
    await clickZoomButton(page, slide);
    const scaleAtCover = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.333) < 0.05,
      3_000,
    );
    // Cover ratio for 320×240 in 800×800 ≈ 1.333
    expect(scaleAtCover).toBeCloseTo(SCALE.VIDEO_COVER, 1);
    // Button must be INACTIVE at cover (fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(false);

    // ── Step 2: cover → natural ──────────────────────────────────────────
    await clickZoomButton(page, slide);
    const scaleAtNatural = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 0.4) < 0.05,
      3_000,
    );
    // Natural-size scale for 320×240 in 800×800 = 320/800 = 0.4
    expect(scaleAtNatural).toBeCloseTo(SCALE.VIDEO_NATURAL, 1);
    // Button must be ACTIVE at natural (not in fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // ── Step 3: natural → contain (wraps back) ───────────────────────────
    await clickZoomButton(page, slide);
    const scaleBackAtContain = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.0) < 0.05,
      3_000,
    );
    expect(scaleBackAtContain).toBeCloseTo(SCALE.VIDEO_CONTAIN, 1);
    // Button must be ACTIVE again at contain.
    expect(await isZoomButtonActive(page, slide)).toBe(true);
  });
});

// ─── HLS video (320×240) ──────────────────────────────────────────────────

test.describe("Feed – zoom levels: HLS video (320×240, 3 levels)", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeHlsMedia({ id: "zoom-levels-hls" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("zoom button cycles contain → cover → natural → contain", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForVideoMetadata(page);

    await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.0) < 0.15,
    );
    // Wait for HLS dimensions to be detected (videoWidth may be 0 at loadedmetadata).
    await waitForNaturalSize(page);
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // contain → cover
    await clickZoomButton(page, slide);
    const scaleAtCover = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.333) < 0.05,
      3_000,
    );
    expect(scaleAtCover).toBeCloseTo(SCALE.VIDEO_COVER, 1);
    // INACTIVE at cover (fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(false);

    // cover → natural
    await clickZoomButton(page, slide);
    const scaleAtNatural = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 0.4) < 0.05,
      3_000,
    );
    expect(scaleAtNatural).toBeCloseTo(SCALE.VIDEO_NATURAL, 1);
    // ACTIVE at natural (not in fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // natural → contain
    await clickZoomButton(page, slide);
    const scaleBackAtContain = await waitForScaleWhere(
      page,
      "feed-slide-video",
      (s) => Math.abs(s - 1.0) < 0.05,
      3_000,
    );
    expect(scaleBackAtContain).toBeCloseTo(SCALE.VIDEO_CONTAIN, 1);
    expect(await isZoomButtonActive(page, slide)).toBe(true);
  });
});

// ─── Image (200×150) ──────────────────────────────────────────────────────

test.describe("Feed – zoom levels: image (200×150, 3 levels)", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "zoom-levels-img" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("zoom button cycles contain → cover → natural → contain", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForImageLoad(page);

    await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 1.0) < 0.15,
    );
    // Wait for natural size to be detected (ensures zoom levels are computed).
    await waitForNaturalSize(page);
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // contain → cover
    await clickZoomButton(page, slide);
    const scaleAtCover = await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 1.333) < 0.05,
      3_000,
    );
    expect(scaleAtCover).toBeCloseTo(SCALE.IMAGE_COVER, 1);
    // INACTIVE at cover (fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(false);

    // cover → natural
    await clickZoomButton(page, slide);
    const scaleAtNatural = await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 0.25) < 0.05,
      3_000,
    );
    expect(scaleAtNatural).toBeCloseTo(SCALE.IMAGE_NATURAL, 1);
    // ACTIVE at natural (not in fill-screen mode).
    expect(await isZoomButtonActive(page, slide)).toBe(true);

    // natural → contain
    await clickZoomButton(page, slide);
    const scaleBackAtContain = await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 1.0) < 0.05,
      3_000,
    );
    expect(scaleBackAtContain).toBeCloseTo(SCALE.IMAGE_CONTAIN, 1);
    expect(await isZoomButtonActive(page, slide)).toBe(true);
  });
});

// ─── Media centering ──────────────────────────────────────────────────────
//
// All media types must fill (and be centred in) the media-area container when
// zoom is at the "contain" level.
//
// The hls-video custom element has display:contents set by @videojs/html.
// We override to display:block so that CSS transforms work.
// Without also setting width:100% / height:100%, hls-video does not fill its
// container and the transform-origin ends up at the wrong position,
// causing the visible content to appear off-centre.

async function waitForTransform(page: Page, testId: string) {
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector(
        `[data-testid="${id}"]`,
      ) as HTMLElement | null;
      return el !== null && el.style.transform !== "";
    },
    testId,
    { timeout: 5_000 },
  );
}

async function expectMediaCentredInArea(page: Page, mediaTestId: string) {
  const result = await page.evaluate((testId) => {
    const media = document.querySelector(
      `[data-testid="${testId}"]`,
    ) as Element | null;
    const area = document.querySelector(
      '[data-testid="feed-slide-media-area"]',
    ) as Element | null;
    if (!media) throw new Error(`No element with data-testid="${testId}"`);
    if (!area) throw new Error("No feed-slide-media-area element");
    const mr = media.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    return {
      mediaCx: mr.left + mr.width / 2,
      mediaCy: mr.top + mr.height / 2,
      areaCx: ar.left + ar.width / 2,
      areaCy: ar.top + ar.height / 2,
    };
  }, mediaTestId);

  expect(
    Math.abs(result.mediaCx - result.areaCx),
    `${mediaTestId} should be horizontally centred in feed-slide-media-area ` +
      `(mediaCx=${result.mediaCx}, areaCx=${result.areaCx})`,
  ).toBeLessThan(3);
  expect(
    Math.abs(result.mediaCy - result.areaCy),
    `${mediaTestId} should be vertically centred in feed-slide-media-area ` +
      `(mediaCy=${result.mediaCy}, areaCy=${result.areaCy})`,
  ).toBeLessThan(3);
}

test.describe("Feed – media element fills and is centred in the media area", () => {
  test.use({ viewport: VIEWPORT });

  test("standard video fills and is centred at contain zoom", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "centering-std" })]] },
    );
    await createAndRunQuery({ request });
    await setVideoFit({ request }, "contain");
    await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-video");
    await expectMediaCentredInArea(page, "feed-slide-video");
  });

  test("HLS video fills and is centred at contain zoom", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeHlsMedia({ id: "centering-hls" })]] },
    );
    await createAndRunQuery({ request });
    await setVideoFit({ request }, "contain");
    await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-video");
    await expectMediaCentredInArea(page, "feed-slide-video");
  });

  test("image fills and is centred at contain zoom", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "centering-img" })]] },
    );
    await createAndRunQuery({ request });
    await setVideoFit({ request }, "contain");
    await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-image");
    await expectMediaCentredInArea(page, "feed-slide-image");
  });
});

// ─── Focal-point zoom, pan during gesture, and snap-back ─────────────────
//
// When a two-finger pinch is performed:
//   1. The zoom must centre on the midpoint of the two fingers, not on the
//      element centre.  A pinch 100 px above/left of the container centre
//      should shift the element so the pinched point stays fixed in the
//      viewport.
//   2. Moving both fingers together (same spread, different position) must
//      pan the media by the matching amount.
//   3. Releasing the gesture must spring the media back to translate(0,0)
//      (centred) as well as snapping to the nearest zoom level.

test.describe("Feed – gesture: focal-point zoom, pan, and snap-back", () => {
  test.use({ viewport: VIEWPORT, hasTouch: true });

  // Use an image – simpler than video (no codec loading, no HLS playlist).
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "gesture-img" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("zoom is centred on the pinch midpoint, not the element centre", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-image");

    const areaBox = await getMediaAreaBox(slide);
    const areaCx = areaBox.x + areaBox.width / 2;
    const areaCy = areaBox.y + areaBox.height / 2;

    // Pinch 100 px left of and 100 px above the area centre.  Zoom 2× (spread
    // 50 → 100 px).
    //
    // Expected pan after gesture:
    //   tx = (pinch.x − ecx)/newScale − (pinch.x − ecx)/startScale
    //      = (−100)/2 − (−100)/1 = +50
    // Element centre X = ecx + newScale × tx = areaCx + 2×50 = areaCx + 100
    const pinchCenter = { x: areaCx - 100, y: areaCy - 100 };
    await holdPinch(page, pinchCenter, 50, 100);

    // Wait for the scale and pan to be applied.
    await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 2) < 0.2,
    );

    // The element should have panned so its centre is areaCx+100, areaCy+100
    // (the pinch focal point is being held at the same screen position).
    await waitForMediaCenterNear(
      page,
      "feed-slide-image",
      areaCx + 100,
      areaCy + 100,
      15,
    );
  });

  test("dragging both fingers pans the media during the gesture", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-image");

    const areaBox = await getMediaAreaBox(slide);
    const areaCx = areaBox.x + areaBox.width / 2;
    const areaCy = areaBox.y + areaBox.height / 2;
    const areaCenter = { x: areaCx, y: areaCy };

    // Start a pinch at the area centre with a constant spread (scale stays 1).
    await holdPinch(page, areaCenter, 100, 100);

    // Drag both fingers 100 px to the left (same spread → no scale change).
    //
    // Expected pan:
    //   tx = (currentMidpoint.x − ecx)/1 − (startMidpoint.x − ecx)/1
    //      = (areaCx−100 − areaCx) − 0 = −100
    // Element centre X = ecx + 1×(−100) = areaCx − 100
    const draggedCenter = { x: areaCx - 100, y: areaCy };
    await movePinch(page, areaCenter, draggedCenter, 100);

    await waitForMediaCenterNear(
      page,
      "feed-slide-image",
      areaCx - 100,
      areaCy,
      15,
    );
  });

  test("media springs back to centre after releasing a panned gesture", async ({
    page,
    request,
  }) => {
    await setVideoFit({ request }, "contain");
    const { slide } = await gotoFeedWithSlide(page);
    await waitForNaturalSize(page);
    await waitForTransform(page, "feed-slide-image");

    const areaBox = await getMediaAreaBox(slide);
    const areaCx = areaBox.x + areaBox.width / 2;
    const areaCy = areaBox.y + areaBox.height / 2;

    // Pinch at an off-centre position → gesture creates a pan offset.
    const pinchCenter = { x: areaCx - 100, y: areaCy - 100 };
    await holdPinch(page, pinchCenter, 50, 100);

    // Wait for scale ≈ 2 so the rAF for both scale and pan has run.
    await waitForScaleWhere(
      page,
      "feed-slide-image",
      (s) => Math.abs(s - 2) < 0.2,
    );

    // Confirm the element is actually off-centre (requires the focal-point fix).
    // Before the fix the element stays centred, so this assertion fails.
    const elCxDuring = await page.evaluate((id) => {
      const el = document.querySelector(
        `[data-testid="${id}"]`,
      ) as HTMLElement | null;
      if (!el) throw new Error(`No element data-testid="${id}"`);
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    }, "feed-slide-image");
    expect(
      Math.abs(elCxDuring - areaCx),
      `element should be off-centre during panned gesture (cx=${elCxDuring}, area cx=${areaCx})`,
    ).toBeGreaterThan(50);

    // Release — scale snaps to nearest level, pan springs back to (0, 0).
    await releasePinch(page, pinchCenter, 100);

    // Wait for the 200 ms snap animation to finish and verify centred position.
    await waitForMediaCenterNear(
      page,
      "feed-slide-image",
      areaCx,
      areaCy,
      3,
      2_000,
    );
  });
});
