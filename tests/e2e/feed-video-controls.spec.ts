/**
 * Tests for the three-zone gesture control system in the feed video player.
 *
 * Zone layout (each zone is 1/3 of the video width):
 *   ┌──────────┬──────────┬──────────┐
 *   │  LEFT    │  MIDDLE  │  RIGHT   │
 *   │ (rewind) │  (play/  │ (forward)│
 *   │          │  pause)  │          │
 *   └──────────┴──────────┴──────────┘
 *
 * Tap behaviour:
 *   - Left zone:   seek backward
 *   - Middle zone: toggle play / pause
 *   - Right zone:  seek forward
 *
 * Hold behaviour (pointer held >250 ms):
 *   - Left zone:   continuous fast-rewind; a rate indicator is shown
 *   - Right zone:  continuous fast-forward; a rate indicator is shown
 *   - Release:     restore previous play/pause state and 1× playback rate
 *
 * Drag-while-holding:
 *   - Drag right:  increase seek speed
 *   - Drag left:   decrease seek speed
 *
 * Play icon:
 *   - Visible in the middle zone while paused, hidden while playing
 *   - Visually reacts (e.g. grows) when the mouse is over the middle zone
 *
 * NOTE: None of this behaviour is implemented yet.  All tests in this file are
 * expected to fail until the feature is built.
 */

import type { GenericMedia } from "@liase/core";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Test-data helpers (same pattern as feed.spec.ts)
// ---------------------------------------------------------------------------

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
        // Small local test video served by the fixture server in global-setup.ts.
        // Using a local server avoids Cloudflare bot-protection blocking proxy range requests.
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
}: {
  request: import("@playwright/test").APIRequestContext;
}) {
  const createRes = await request.post("/api/admin/queries", {
    data: {
      title: "Video Controls Test Query",
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

// ---------------------------------------------------------------------------
// Shared page helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to /feed and return the first video slide and its <video> element.
 * Waits until both are attached to the DOM.
 */
async function gotoFeedWithVideo(page: Page) {
  await page.goto("/media/feed");
  const slide = page.getByTestId("feed-slide").first();
  await slide.waitFor({ state: "visible", timeout: 40_000 });
  const video = slide.getByTestId("feed-slide-video");
  await video.waitFor({ state: "attached", timeout: 15_000 });
  return { slide, video };
}

/**
 * Wait until the <video> element has at least HAVE_METADATA (readyState ≥ 1)
 * so that duration is known and currentTime can be set reliably.
 */
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

/**
 * Set the video's currentTime and wait for the seek to complete.
 */
async function setVideoTime(page: Page, seconds: number) {
  await page.evaluate((t) => {
    return new Promise<void>((resolve, reject) => {
      const video = document.querySelector(
        '[data-testid="feed-slide-video"]',
      ) as HTMLVideoElement | null;
      if (!video) return reject(new Error("No feed-slide-video element found"));
      const onSeeked = () => resolve();
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = t;
    });
  }, seconds);
}

/** Return the video's current playback position in seconds. */
async function getVideoTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    return video.currentTime;
  });
}

/** Return whether the video is currently paused. */
async function isVideoPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    return video.paused;
  });
}

/** Return the video's current playbackRate. */
async function getPlaybackRate(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    return video.playbackRate;
  });
}

/** Programmatically play the video (bypasses autoplay policy). */
async function playVideo(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    return video.play();
  });
}

/** Programmatically pause the video. */
async function pauseVideo(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="feed-slide-video"]',
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No feed-slide-video element found");
    video.pause();
  });
}

/**
 * Return the centre pixel coordinates for a given tap zone within the media
 * area of the provided slide locator.
 *
 * Zones are equally-sized thirds of the media area width:
 *   left   – x ∈ [0, 1/3)
 *   middle – x ∈ [1/3, 2/3)
 *   right  – x ∈ [2/3, 1]
 */
async function getZonePosition(
  slide: Locator,
  zone: "left" | "middle" | "right",
): Promise<{ x: number; y: number }> {
  const mediaArea = slide.getByTestId("feed-slide-media-area");
  const box = await mediaArea.boundingBox();
  if (!box) throw new Error("Cannot get feed-slide-media-area bounding box");
  const y = box.y + box.height / 2;
  const xFraction = zone === "left" ? 1 / 6 : zone === "middle" ? 1 / 2 : 5 / 6;
  return { x: box.x + box.width * xFraction, y };
}

// ---------------------------------------------------------------------------
// Tests – Tap zone controls
// ---------------------------------------------------------------------------

test.describe("Feed video – tap zone controls", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeVideoMedia({ id: "tap-vid" })]] });
    await createAndRunQuery({ request });
  });

  test("tapping the middle zone while playing pauses the video", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 25);
    await playVideo(page);
    expect(await isVideoPaused(page)).toBe(false);

    const { x, y } = await getZonePosition(slide, "middle");
    await page.mouse.click(x, y);

    await expect.poll(() => isVideoPaused(page), { timeout: 2_000 }).toBe(true);
  });

  test("tapping the middle zone while paused plays the video", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 25);
    await pauseVideo(page);
    expect(await isVideoPaused(page)).toBe(true);

    const { x, y } = await getZonePosition(slide, "middle");
    await page.mouse.click(x, y);

    await expect
      .poll(() => isVideoPaused(page), { timeout: 2_000 })
      .toBe(false);
  });

  test("tapping the right zone seeks forward", async ({ page }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    const timeBefore = await getVideoTime(page);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.click(x, y);

    await expect
      .poll(() => getVideoTime(page), { timeout: 2_000 })
      .toBeGreaterThan(timeBefore);
  });

  test("tapping the left zone seeks backward", async ({ page }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 30);
    const timeBefore = await getVideoTime(page);

    const { x, y } = await getZonePosition(slide, "left");
    await page.mouse.click(x, y);

    await expect
      .poll(() => getVideoTime(page), { timeout: 2_000 })
      .toBeLessThan(timeBefore);
  });

  test("a tap (< 250 ms) on the right zone does not start continuous fast-forward", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "right");
    // Quick tap – well under the 250 ms hold threshold
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();

    // Playback rate must remain 1× (no fast-forward mode triggered)
    await expect.poll(() => getPlaybackRate(page), { timeout: 500 }).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests – Hold zone controls
// ---------------------------------------------------------------------------

test.describe("Feed video – hold zone controls", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeVideoMedia({ id: "hold-vid" })]] });
    await createAndRunQuery({ request });
  });

  test("holding the right zone for >250 ms causes the video to fast-forward", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Wait well past the 250 ms hold threshold
    await page.waitForTimeout(600);

    // The video should be playing faster than 1× while the button is held
    expect(await getPlaybackRate(page)).toBeGreaterThan(1);

    await page.mouse.up();
  });

  test("holding the left zone for >250 ms causes the video to rewind", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 30);

    const timeBefore = await getVideoTime(page);

    const { x, y } = await getZonePosition(slide, "left");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(700);

    const timeDuringHold = await getVideoTime(page);
    await page.mouse.up();

    // The position in the video must have moved backward during the hold
    expect(timeDuringHold).toBeLessThan(timeBefore);
  });

  test("releasing after holding the right zone restores 1× playback rate", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    // Confirm hold mode is active
    expect(await getPlaybackRate(page)).toBeGreaterThan(1);

    await page.mouse.up();
    await page.waitForTimeout(100);

    // Playback rate must be back to normal
    expect(await getPlaybackRate(page)).toBe(1);
  });

  test("releasing after holding the left zone restores normal play/pause state", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 30);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "left");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(150);

    // After releasing, rate must be back to 1×
    expect(await getPlaybackRate(page)).toBe(1);
    // And the video must be playing again (was playing before hold)
    expect(await isVideoPaused(page)).toBe(false);
  });

  test("holding a zone does not trigger the tap seek action", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    // Place video well into the middle so a tap-seek-forward would be obvious
    await setVideoTime(page, 20);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);

    // Record time right before release so we can distinguish "one big seek-forward
    // tap" from "continuous fast-forward that has been running"
    const timeDuringHold = await getVideoTime(page);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const timeAfterRelease = await getVideoTime(page);

    // After release the time should NOT jump by the tap-seek-forward amount
    // (a single right-zone tap would skip ~10 s or ~20 % of duration).
    // If hold mode worked correctly, the advance after release is ≤ 1 s
    // (normal 1× playback over 150 ms).
    expect(timeAfterRelease - timeDuringHold).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// Tests – Drag to adjust seek speed while holding
// ---------------------------------------------------------------------------

test.describe("Feed video – drag to adjust seek speed", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeVideoMedia({ id: "drag-vid" })]] });
    await createAndRunQuery({ request });
  });

  test("dragging right while holding the right zone increases fast-forward speed", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const box = await mediaArea.boundingBox();
    if (!box) throw new Error("Cannot get media area bounding box");

    const { x, y } = await getZonePosition(slide, "right");

    // Enter hold mode
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    const rateAtHoldStart = await getPlaybackRate(page);

    // Drag right (positive offset from the initial pointer-down position)
    await page.mouse.move(x + box.width * 0.12, y, { steps: 8 });
    await page.waitForTimeout(100);

    const rateAfterDragRight = await getPlaybackRate(page);
    await page.mouse.up();

    expect(rateAfterDragRight).toBeGreaterThan(rateAtHoldStart);
  });

  test("dragging left while holding the right zone decreases fast-forward speed", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const box = await mediaArea.boundingBox();
    if (!box) throw new Error("Cannot get media area bounding box");

    const { x, y } = await getZonePosition(slide, "right");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    const rateAtHoldStart = await getPlaybackRate(page);

    // Drag left (negative offset)
    await page.mouse.move(x - box.width * 0.12, y, { steps: 8 });
    await page.waitForTimeout(100);

    const rateAfterDragLeft = await getPlaybackRate(page);
    await page.mouse.up();

    expect(rateAfterDragLeft).toBeLessThan(rateAtHoldStart);
  });

  test("dragging right while holding the left zone slows the rewind speed", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 35);

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const box = await mediaArea.boundingBox();
    if (!box) throw new Error("Cannot get media area bounding box");

    const { x, y } = await getZonePosition(slide, "left");
    const indicator = slide.getByTestId("feed-slide-rate-indicator");

    // Enter hold mode on the left zone and read the baseline rate from the
    // rate indicator. Rewind uses a setInterval rather than video.playbackRate,
    // so we read the displayed label instead of time-based measurement to avoid
    // flakiness caused by setInterval timer jitter.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await expect(indicator).toBeVisible({ timeout: 1_000 });
    const baselineText = await indicator.textContent();

    // Drag right – should reduce the absolute rewind rate (slower rewind)
    await page.mouse.move(x + box.width * 0.12, y, { steps: 8 });
    await page.waitForTimeout(100);
    const afterDragText = await indicator.textContent();

    await page.mouse.up();

    // Parse the numeric rate magnitude from the indicator label (e.g. "−1.5x" → 1.5)
    const parseRate = (text: string | null) =>
      Number.parseFloat((text ?? "").replace(/[^\d.]/g, ""));

    const baselineRate = parseRate(baselineText);
    const afterDragRate = parseRate(afterDragText);

    // After dragging right the absolute rewind rate should be smaller (slower rewind)
    expect(afterDragRate).toBeLessThan(baselineRate);
  });
});

// ---------------------------------------------------------------------------
// Tests – Rate indicator
// ---------------------------------------------------------------------------

test.describe("Feed video – rate indicator", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup({ request }, { media: [[makeVideoMedia({ id: "rate-vid" })]] });
    await createAndRunQuery({ request });
  });

  test("rate indicator is not visible during normal playback", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await playVideo(page);
    // Allow a moment for any transient indicators to settle
    await page.waitForTimeout(500);

    await expect(
      slide.getByTestId("feed-slide-rate-indicator"),
    ).not.toBeVisible();
  });

  test("rate indicator appears when the right zone is held", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350); // Past the hold threshold

    await expect(slide.getByTestId("feed-slide-rate-indicator")).toBeVisible({
      timeout: 1_000,
    });

    await page.mouse.up();
  });

  test("rate indicator appears when the left zone is held", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 30);

    const { x, y } = await getZonePosition(slide, "left");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    await expect(slide.getByTestId("feed-slide-rate-indicator")).toBeVisible({
      timeout: 1_000,
    });

    await page.mouse.up();
  });

  test("rate indicator displays the current playback rate", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    const indicator = slide.getByTestId("feed-slide-rate-indicator");
    await expect(indicator).toBeVisible({ timeout: 1_000 });

    // Should display a rate value such as "1.5x", "2x", "−2x", etc.
    const text = await indicator.textContent();
    expect(text).toMatch(/[\d.]+x/i);

    await page.mouse.up();
  });

  test("rate indicator is positioned at the top of the video", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    const indicator = slide.getByTestId("feed-slide-rate-indicator");
    await expect(indicator).toBeVisible({ timeout: 1_000 });

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const mediaBox = await mediaArea.boundingBox();
    const indicatorBox = await indicator.boundingBox();
    if (!mediaBox || !indicatorBox)
      throw new Error("Cannot get bounding boxes");

    // Indicator should be in the top quarter of the media area
    const indicatorCenterY = indicatorBox.y + indicatorBox.height / 2;
    expect(indicatorCenterY).toBeLessThan(mediaBox.y + mediaBox.height * 0.25);

    await page.mouse.up();
  });

  test("rate indicator disappears after releasing the hold", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    await expect(slide.getByTestId("feed-slide-rate-indicator")).toBeVisible({
      timeout: 1_000,
    });

    await page.mouse.up();
    // The indicator may fade out; allow a short animation window
    await expect(
      slide.getByTestId("feed-slide-rate-indicator"),
    ).not.toBeVisible({ timeout: 2_000 });
  });

  test("rate indicator updates when drag changes the playback rate", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await setVideoTime(page, 20);
    await playVideo(page);

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const box = await mediaArea.boundingBox();
    if (!box) throw new Error("Cannot get media area bounding box");

    const { x, y } = await getZonePosition(slide, "right");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);

    const indicator = slide.getByTestId("feed-slide-rate-indicator");
    await expect(indicator).toBeVisible({ timeout: 1_000 });
    const textBefore = await indicator.textContent();

    // Drag far right to increase the rate significantly
    await page.mouse.move(x + box.width * 0.25, y, { steps: 12 });
    await page.waitForTimeout(150);

    const textAfter = await indicator.textContent();
    await page.mouse.up();

    // The displayed rate value should have changed
    expect(textAfter).not.toBe(textBefore);
  });
});

// ---------------------------------------------------------------------------
// Tests – Play icon
// ---------------------------------------------------------------------------

test.describe("Feed video – play icon", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      {
        request,
      },
      { media: [[makeVideoMedia({ id: "play-icon-vid" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("play icon is visible in the middle zone when the video is paused", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await pauseVideo(page);

    await expect(slide.getByTestId("feed-slide-play-icon")).toBeVisible({
      timeout: 2_000,
    });
  });

  test("play icon is not visible when the video is playing", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await playVideo(page);
    // Give playback a moment to start so the icon can hide
    await page.waitForTimeout(300);

    await expect(slide.getByTestId("feed-slide-play-icon")).not.toBeVisible({
      timeout: 2_000,
    });
  });

  test("play icon becomes visible again when a playing video is paused", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await playVideo(page);
    await page.waitForTimeout(300);
    await expect(slide.getByTestId("feed-slide-play-icon")).not.toBeVisible();

    await pauseVideo(page);

    await expect(slide.getByTestId("feed-slide-play-icon")).toBeVisible({
      timeout: 2_000,
    });
  });

  test("play icon is positioned within the middle third of the video", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await pauseVideo(page);

    const playIcon = slide.getByTestId("feed-slide-play-icon");
    await expect(playIcon).toBeVisible({ timeout: 2_000 });

    const mediaArea = slide.getByTestId("feed-slide-media-area");
    const mediaBox = await mediaArea.boundingBox();
    const iconBox = await playIcon.boundingBox();
    if (!mediaBox || !iconBox) throw new Error("Cannot get bounding boxes");

    const iconCenterX = iconBox.x + iconBox.width / 2;
    const middleZoneLeft = mediaBox.x + mediaBox.width * (1 / 3);
    const middleZoneRight = mediaBox.x + mediaBox.width * (2 / 3);

    expect(iconCenterX).toBeGreaterThan(middleZoneLeft);
    expect(iconCenterX).toBeLessThan(middleZoneRight);
  });

  test("hovering over the middle zone while paused makes the play icon grow", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await pauseVideo(page);

    const playIcon = slide.getByTestId("feed-slide-play-icon");
    await expect(playIcon).toBeVisible({ timeout: 2_000 });

    // Move the mouse well away so we start from a neutral (non-hovered) state
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const sizeNotHovered = await playIcon.evaluate((el) => {
      const style = getComputedStyle(el);
      // Use offsetWidth/offsetHeight as a proxy for the rendered size;
      // some implementations grow via font-size, others via transform/scale.
      return el.getBoundingClientRect().width;
    });

    // Hover over the middle zone
    const { x, y } = await getZonePosition(slide, "middle");
    await page.mouse.move(x, y);
    await page.waitForTimeout(150);
    const sizeHovered = await playIcon.evaluate((el) => {
      return el.getBoundingClientRect().width;
    });

    // The play icon should be visually larger (or at least no smaller) when hovered
    expect(sizeHovered).toBeGreaterThan(sizeNotHovered);
  });

  test("hovering over the left or right zone does not change the play icon size", async ({
    page,
  }) => {
    const { slide } = await gotoFeedWithVideo(page);
    await waitForVideoMetadata(page);
    await pauseVideo(page);

    const playIcon = slide.getByTestId("feed-slide-play-icon");
    await expect(playIcon).toBeVisible({ timeout: 2_000 });

    // Get the neutral (no hover) size
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const sizeNeutral = await playIcon.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    // Hover over left zone
    const leftPos = await getZonePosition(slide, "left");
    await page.mouse.move(leftPos.x, leftPos.y);
    await page.waitForTimeout(150);
    const sizeOnLeft = await playIcon.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(sizeOnLeft).toBe(sizeNeutral);

    // Hover over right zone
    const rightPos = await getZonePosition(slide, "right");
    await page.mouse.move(rightPos.x, rightPos.y);
    await page.waitForTimeout(150);
    const sizeOnRight = await playIcon.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(sizeOnRight).toBe(sizeNeutral);
  });
});

// ---------------------------------------------------------------------------
// Helpers – current-slide-aware queries (used by keyboard tests)
// ---------------------------------------------------------------------------

async function getCurrentSlideVideoTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector(
      "[data-current] [data-testid='feed-slide-video']",
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No current feed-slide-video found");
    return video.currentTime;
  });
}

async function setCurrentSlideVideoTime(page: Page, seconds: number) {
  await page.evaluate((t) => {
    return new Promise<void>((resolve, reject) => {
      const video = document.querySelector(
        "[data-current] [data-testid='feed-slide-video']",
      ) as HTMLVideoElement | null;
      if (!video) return reject(new Error("No current feed-slide-video found"));
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.currentTime = t;
    });
  }, seconds);
}

async function getCurrentSlidePlaybackRate(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector(
      "[data-current] [data-testid='feed-slide-video']",
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No current feed-slide-video found");
    return video.playbackRate;
  });
}

async function getCurrentSlideVideoPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const video = document.querySelector(
      "[data-current] [data-testid='feed-slide-video']",
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No current feed-slide-video found");
    return video.paused;
  });
}

async function playCurrentSlideVideo(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector(
      "[data-current] [data-testid='feed-slide-video']",
    ) as HTMLVideoElement | null;
    if (!video) throw new Error("No current feed-slide-video found");
    return video.play();
  });
}

async function waitForCurrentVideoMetadata(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        "[data-current] [data-testid='feed-slide-video']",
      ) as HTMLVideoElement | null;
      return el !== null && el.readyState >= 1;
    },
    { timeout: 15_000 },
  );
}

// ---------------------------------------------------------------------------
// Tests – Keyboard controls
// ---------------------------------------------------------------------------

test.describe("Feed video – keyboard controls", () => {
  test.use({ viewport: VIEWPORT });

  test.describe("single video", () => {
    test.beforeEach(async ({ request }) => {
      await setup(
        { request },
        { media: [[makeVideoMedia({ id: "kbd-vid" })]] },
      );
      await createAndRunQuery({ request });
    });

    test("pressing ArrowRight seeks the current video forward", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);
      const timeBefore = await getCurrentSlideVideoTime(page);

      await page.keyboard.down("ArrowRight");
      await page.keyboard.up("ArrowRight");

      await expect
        .poll(() => getCurrentSlideVideoTime(page), { timeout: 2_000 })
        .toBeGreaterThan(timeBefore);
    });

    test("pressing ArrowLeft seeks the current video backward", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 30);
      const timeBefore = await getCurrentSlideVideoTime(page);

      await page.keyboard.down("ArrowLeft");
      await page.keyboard.up("ArrowLeft");

      await expect
        .poll(() => getCurrentSlideVideoTime(page), { timeout: 2_000 })
        .toBeLessThan(timeBefore);
    });

    test("a tap (< 250 ms) on ArrowRight does not start continuous fast-forward", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);
      await playCurrentSlideVideo(page);

      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(80);
      await page.keyboard.up("ArrowRight");

      await expect
        .poll(() => getCurrentSlidePlaybackRate(page), { timeout: 500 })
        .toBe(1);
    });

    test("holding ArrowRight for >250 ms causes the video to fast-forward", async ({
      page,
    }) => {
      const { slide } = await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);
      await playCurrentSlideVideo(page);

      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(400);

      expect(await getCurrentSlidePlaybackRate(page)).toBeGreaterThan(1);
      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).toBeVisible();

      await page.keyboard.up("ArrowRight");
    });

    test("holding ArrowLeft for >250 ms causes the video to rewind", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 30);
      const timeBefore = await getCurrentSlideVideoTime(page);

      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(600);
      const timeDuringHold = await getCurrentSlideVideoTime(page);
      await page.keyboard.up("ArrowLeft");

      expect(timeDuringHold).toBeLessThan(timeBefore);
    });

    test("releasing ArrowRight after hold restores 1× playback rate", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);
      await playCurrentSlideVideo(page);

      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(400);
      expect(await getCurrentSlidePlaybackRate(page)).toBeGreaterThan(1);

      await page.keyboard.up("ArrowRight");
      await page.waitForTimeout(100);

      expect(await getCurrentSlidePlaybackRate(page)).toBe(1);
    });

    test("releasing ArrowLeft after hold restores normal play/pause state", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 30);
      await playCurrentSlideVideo(page);

      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(400);
      await page.keyboard.up("ArrowLeft");
      await page.waitForTimeout(150);

      expect(await getCurrentSlidePlaybackRate(page)).toBe(1);
      expect(await getCurrentSlideVideoPaused(page)).toBe(false);
    });

    test("rate indicator appears when ArrowRight is held", async ({ page }) => {
      const { slide } = await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);

      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).not.toBeVisible();

      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(400);

      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).toBeVisible();

      await page.keyboard.up("ArrowRight");
    });

    test("rate indicator disappears after releasing ArrowRight", async ({
      page,
    }) => {
      const { slide } = await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);
      await setCurrentSlideVideoTime(page, 20);

      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(400);
      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).toBeVisible();

      await page.keyboard.up("ArrowRight");
      await page.waitForTimeout(200);

      await expect(
        slide.getByTestId("feed-slide-rate-indicator"),
      ).not.toBeVisible();
    });
  });

  test.describe("navigation", () => {
    test.beforeEach(async ({ request }) => {
      await setup(
        { request },
        {
          media: [
            [
              makeVideoMedia({ id: "kbd-nav-vid-1" }),
              makeVideoMedia({ id: "kbd-nav-vid-2" }),
            ],
          ],
        },
      );
      await createAndRunQuery({ request });
    });

    test("ArrowRight seeks the correct video after navigating to the next slide", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);

      // Navigate to the second slide and wait for it to become current
      await page.keyboard.press("ArrowDown");
      const slides = page.getByTestId("feed-slide");
      await expect(slides.nth(1)).toHaveClass(/is-current/, {
        timeout: 10_000,
      });
      await waitForCurrentVideoMetadata(page);

      await setCurrentSlideVideoTime(page, 20);
      const timeBefore = await getCurrentSlideVideoTime(page);

      await page.keyboard.down("ArrowRight");
      await page.keyboard.up("ArrowRight");

      await expect
        .poll(() => getCurrentSlideVideoTime(page), { timeout: 2_000 })
        .toBeGreaterThan(timeBefore);
    });

    test("ArrowLeft seeks the correct video after navigating to the next slide", async ({
      page,
    }) => {
      await gotoFeedWithVideo(page);
      await waitForCurrentVideoMetadata(page);

      await page.keyboard.press("ArrowDown");
      const slides = page.getByTestId("feed-slide");
      await expect(slides.nth(1)).toHaveClass(/is-current/, {
        timeout: 10_000,
      });
      await waitForCurrentVideoMetadata(page);

      await setCurrentSlideVideoTime(page, 30);
      const timeBefore = await getCurrentSlideVideoTime(page);

      await page.keyboard.down("ArrowLeft");
      await page.keyboard.up("ArrowLeft");

      await expect
        .poll(() => getCurrentSlideVideoTime(page), { timeout: 2_000 })
        .toBeLessThan(timeBefore);
    });
  });
});
