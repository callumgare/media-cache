import type { GenericMedia } from "@liase/core";
import { expect, test } from "@playwright/test";
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
    await page.goto("/");

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
    await page.goto("/");

    const videoItem = page.locator("[data-media-id] video").first();
    await videoItem.waitFor({ state: "attached", timeout: 15_000 });
    await videoItem.evaluate((el) => (el as HTMLVideoElement).click());

    const pswp = page.locator(".pswp");
    await expect(pswp).toBeVisible({ timeout: 5_000 });
    await expect(pswp).toHaveClass(/pswp--open/, { timeout: 5_000 });

    const videoSkin = pswp.locator("video-minimal-skin");
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
