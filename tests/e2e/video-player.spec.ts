import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";
import { collectConsoleProblems } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * HLS video fixture served by the local fixture server (global-setup.ts).
 * Intentionally omits width/height to simulate remote HLS sources (e.g.
 * Bluesky) where dimensions are not pre-computed in the DB — centering must
 * be driven by the loadedmetadata event on the <hls-video> element.
 */
function makeHlsVideoMedia(
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
        url: `${fixtureServerUrl}/hls/playlist.m3u8`,
        video: true,
        audio: false,
        image: false,
        ext: "m3u8",
        // width / height omitted on purpose — centering must work without them
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
      title: "Video Player Test Query",
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
        if (tasks.every((t) => t.status !== "running")) {
          const failed = tasks.filter((t) => t.status === "failed");
          if (failed.length > 0)
            throw new Error(
              `Query execution failed: ${JSON.stringify(failed)}`,
            );
          return;
        }
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

test.describe("Video player in lightbox", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [[makeVideoMedia({ id: "video-test-1" })]],
      },
    );
    await createAndRunQuery({ request });
  });

  test("video slides render a video.js v10 <video-player> element", async ({
    page,
  }) => {
    const problems = collectConsoleProblems(page);
    await page.goto("/media/grid");

    // Wait for the video item to appear in the grid (attached to DOM)
    const videoItem = page.locator("[data-media-id] video").first();
    await videoItem.waitFor({ state: "attached", timeout: 15_000 });

    // Programmatic click bypasses the ::after play-button pseudo-element which
    // lacks pointer-events:none and would otherwise intercept the click.
    await videoItem.evaluate((el) => (el as HTMLVideoElement).click());

    // PhotoSwipe should open
    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    // The video.js v10 <video-player> custom element must be present inside the lightbox
    const videoPlayer = pswp.locator("video-player");
    await expect(videoPlayer).toBeAttached({ timeout: 5_000 });

    // The underlying <video> element must have the correct src
    const videoEl = videoPlayer.locator("video");
    await expect(videoEl).toBeAttached({ timeout: 5_000 });
    await expect(videoEl).toHaveAttribute("src", /\.mp4/, { timeout: 5_000 });

    expect(
      problems.filter(
        // Ignore expected network errors for the fake video URL
        (p) => !p.includes("net::ERR") && !p.includes("Failed to load"),
      ),
      "No unexpected console errors or warnings",
    ).toEqual([]);
  });

  test("video is centered and properly scaled in the lightbox", async ({
    page,
  }) => {
    // Use a viewport where the 1280×720 video must be scaled down (letterboxed),
    // which makes centering clearly measurable.
    await page.setViewportSize({ width: 800, height: 500 });
    await page.goto("/media/grid");

    const videoItem = page.locator("[data-media-id] video").first();
    await videoItem.waitFor({ state: "attached", timeout: 15_000 });
    await videoItem.evaluate((el) => (el as HTMLVideoElement).click());

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    const videoSkin = pswp.locator("media-container.media-minimal-skin");
    await expect(videoSkin).toBeAttached({ timeout: 5_000 });

    // Wait for the opening animation to finish (same signal used by the arrow-key / backdrop tests)
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    const skinBox = await videoSkin.boundingBox();
    expect(
      skinBox,
      "video-skin must be rendered with non-zero size",
    ).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport, "page must have a viewport").not.toBeNull();
    if (!skinBox || !viewport) return;

    // The sintel test video is 1280×720 (16:9).  In an 800×500 viewport
    // PhotoSwipe should scale it to fit the narrower dimension (width), giving
    // 800×450, NOT fill the full viewport height of 500.
    // If the video fills the viewport height (skinBox.height ≈ 500) the slide
    // data has no dimensions and the video is sized incorrectly.
    expect(skinBox.height).toBeLessThan(viewport.height - 10);

    // The center of the video-skin must be at the viewport center (±10 px).
    const skinCenterX = skinBox.x + skinBox.width / 2;
    const skinCenterY = skinBox.y + skinBox.height / 2;
    expect(Math.abs(skinCenterX - viewport.width / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(skinCenterY - viewport.height / 2)).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// HLS video centering
// ---------------------------------------------------------------------------

test.describe("HLS video in lightbox", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeHlsVideoMedia({ id: "hls-test-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("HLS video is centered and properly scaled in the lightbox", async ({
    page,
  }) => {
    // 800×800 viewport — the test video is 320×240 (4:3).
    // Width-constrained (800/800 = 1.0 < 320/240 = 1.33), so PhotoSwipe
    // must scale it to 800×600, leaving visible letterboxing top and bottom.
    await page.setViewportSize({ width: 800, height: 800 });
    await page.goto("/media/grid");

    const videoItem = page.locator("[data-media-id] video").first();
    await videoItem.waitFor({ state: "attached", timeout: 15_000 });
    await videoItem.evaluate((el) => (el as HTMLVideoElement).click());

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    // For HLS, the lightbox renders an <hls-video> element (not plain <video>).
    const hlsVideoEl = pswp.locator("hls-video");
    await expect(hlsVideoEl).toBeAttached({ timeout: 5_000 });

    // Wait until the loadedmetadata handler has written the video's real
    // dimensions into the slide.  Before our fix pswp.currSlide.width stayed
    // 0 for HLS, causing the content to fill the viewport instead of fitting.
    await page.waitForFunction(() => (window.pswp?.currSlide?.width ?? 0) > 0, {
      timeout: 15_000,
    });

    // Wait for the opening animation to finish before measuring positions.
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    const videoSkin = pswp.locator("media-container.media-minimal-skin");
    const skinBox = await videoSkin.boundingBox();
    expect(
      skinBox,
      "video-skin must be rendered with non-zero size",
    ).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport, "page must have a viewport").not.toBeNull();
    if (!skinBox || !viewport) return;

    // The test video is 320×240 (4:3).  In an 800×800 viewport PhotoSwipe
    // scales it to 800×600 (width-constrained), NOT fill the full 800 px height.
    // If skinBox.height ≈ 800 it means slide dimensions were never set from
    // loadedmetadata and the content incorrectly filled the viewport.
    expect(skinBox.height).toBeLessThan(viewport.height - 10);

    // The video must be horizontally and vertically centred (±10 px).
    const skinCenterX = skinBox.x + skinBox.width / 2;
    const skinCenterY = skinBox.y + skinBox.height / 2;
    expect(Math.abs(skinCenterX - viewport.width / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(skinCenterY - viewport.height / 2)).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// HLS video sizing after lightbox navigation
// ---------------------------------------------------------------------------

test.describe("HLS video in lightbox – navigation", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "nav-image-1" }),
            makeHlsVideoMedia({ id: "nav-hls-1" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("HLS video is properly sized when navigated to from an adjacent slide", async ({
    page,
  }) => {
    // 800×800 viewport — the test video is 320×240 (4:3).
    // Width-constrained: PhotoSwipe scales to 800×600, leaving 200 px letterboxing.
    await page.setViewportSize({ width: 800, height: 800 });
    await page.goto("/media/grid");

    // Open the image item to enter the lightbox.
    // (Images render as <img> in the grid; HLS video renders as <hls-video>.)
    const firstItem = page.locator("[data-media-id] img").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await firstItem.click();

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    // Wait for the opening animation to finish so keyboard events are bound
    await page.waitForFunction(() => !!window.pswp?.opener?.isOpen, {
      timeout: 5_000,
    });

    const counter = pswp.locator(".pswp__counter");

    // Navigate to the adjacent HLS video slide.
    // Media items can appear in either order due to random API ordering, so check
    // the current counter position to determine which direction the HLS video is in.
    const counterText = (await counter.textContent({ timeout: 5_000 })) ?? "";
    if (counterText.includes("1 /")) {
      // Image is the first slide; HLS video is to the right
      await page.keyboard.press("ArrowRight");
      await expect(counter).toContainText("2 /", { timeout: 5_000 });
    } else {
      // Image is the last slide; HLS video is to the left
      await page.keyboard.press("ArrowLeft");
      await expect(counter).toContainText("1 /", { timeout: 5_000 });
    }

    // Wait until the HLS video's real dimensions are written into the current slide
    await page.waitForFunction(() => (window.pswp?.currSlide?.width ?? 0) > 0, {
      timeout: 15_000,
    });

    const videoSkin = pswp.locator("media-container.media-minimal-skin");
    await expect(videoSkin).toBeAttached({ timeout: 10_000 });

    const skinBox = await videoSkin.boundingBox();
    expect(
      skinBox,
      "video-skin must be rendered with non-zero size",
    ).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport, "page must have a viewport").not.toBeNull();
    if (!skinBox || !viewport) return;

    // The test video is 320×240 (4:3). In an 800×800 viewport PhotoSwipe
    // should scale it to 800×600 (width-constrained), NOT fill the full 800 px height.
    // If skinBox.height ≈ 800 it means dimensions were not applied after navigation.
    expect(skinBox.height).toBeLessThan(viewport.height - 10);

    // The video must be horizontally and vertically centred (±10 px).
    const skinCenterX = skinBox.x + skinBox.width / 2;
    const skinCenterY = skinBox.y + skinBox.height / 2;
    expect(Math.abs(skinCenterX - viewport.width / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(skinCenterY - viewport.height / 2)).toBeLessThanOrEqual(10);
  });
});
