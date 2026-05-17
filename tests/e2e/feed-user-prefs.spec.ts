import type { GenericMedia } from "@liase/core";
import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Helpers (copied from feed.spec.ts pattern)
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
      title: "Prefs Test Query",
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

const VIEWPORT = { width: 800, height: 800 };

// ---------------------------------------------------------------------------
// Loop button tests
// ---------------------------------------------------------------------------

test.describe("Feed page – loop button", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "loop-vid-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("loop button is visible on a video slide", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 50_000 });
    await expect(firstSlide.getByTestId("feed-slide-loop-btn")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("loop button is not active by default", async ({ page }) => {
    await page.goto("/media/feed");
    const btn = page
      .getByTestId("feed-slide")
      .first()
      .getByTestId("feed-slide-loop-btn");
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(btn).not.toHaveClass(/active/);
  });

  test("clicking loop button makes it active and sets loop on video", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-loop-btn");
    await btn.click();

    await expect(btn).toHaveClass(/active/, { timeout: 3_000 });
    const video = firstSlide.getByTestId("feed-slide-video");
    await expect(video).toHaveAttribute("loop", { timeout: 3_000 });
  });

  test("clicking loop button again deactivates it and removes loop", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-loop-btn");
    await btn.click();
    await expect(btn).toHaveClass(/active/, { timeout: 3_000 });

    await btn.click();
    await expect(btn).not.toHaveClass(/active/, { timeout: 3_000 });
    const video = firstSlide.getByTestId("feed-slide-video");
    await expect(video).not.toHaveAttribute("loop");
  });

  test("loop preference persists across page reload", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    await firstSlide.getByTestId("feed-slide-loop-btn").click();
    await expect(firstSlide.getByTestId("feed-slide-loop-btn")).toHaveClass(
      /active/,
      { timeout: 3_000 },
    );

    await page.reload();
    const reloadedSlide = page.getByTestId("feed-slide").first();
    await expect(reloadedSlide).toBeVisible({ timeout: 15_000 });
    await expect(reloadedSlide.getByTestId("feed-slide-loop-btn")).toHaveClass(
      /active/,
      { timeout: 5_000 },
    );
    const video = reloadedSlide.getByTestId("feed-slide-video");
    await expect(video).toHaveAttribute("loop", { timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Zoom (fill-screen) button tests
// ---------------------------------------------------------------------------

test.describe("Feed page – zoom button", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeImageMedia({ id: "zoom-img-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("zoom button shows search-plus icon and is not active by default (cover mode)", async ({
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
    await expect(btn).not.toHaveClass(/active/);
  });

  test("clicking zoom button switches to contain mode (search-minus icon, removes fill-screen class)", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-fill-screen-btn");
    await btn.click();

    await expect(btn.locator(".pi-search-minus")).toBeAttached({
      timeout: 3_000,
    });
    await expect(btn.locator(".pi-search-plus")).not.toBeAttached();
    await expect(firstSlide).not.toHaveClass(/fill-screen/);
    await expect(btn).toHaveClass(/active/);
  });

  test("clicking zoom button again reverts to cover mode", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-fill-screen-btn");
    await btn.click();
    await expect(firstSlide).not.toHaveClass(/fill-screen/, { timeout: 3_000 });

    await btn.click();
    await expect(firstSlide).toHaveClass(/fill-screen/, { timeout: 3_000 });
    await expect(btn).not.toHaveClass(/active/);
  });

  test("zoom-out preference persists across page reload", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    // Click to zoom out (default is zoomed in / cover mode)
    await firstSlide.getByTestId("feed-slide-fill-screen-btn").click();
    await expect(firstSlide).not.toHaveClass(/fill-screen/, { timeout: 3_000 });
    await expect(
      firstSlide.getByTestId("feed-slide-fill-screen-btn"),
    ).toHaveClass(/active/, { timeout: 3_000 });

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
// Mute button tests
// ---------------------------------------------------------------------------

test.describe("Feed page – mute button", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      { media: [[makeVideoMedia({ id: "mute-vid-1" })]] },
    );
    await createAndRunQuery({ request });
  });

  test("mute button is visible on a video slide", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await expect(firstSlide.getByTestId("feed-slide-mute-btn")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("mute button shows volume-off icon and is not active by default (muted is default)", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const btn = page
      .getByTestId("feed-slide")
      .first()
      .getByTestId("feed-slide-mute-btn");
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(btn.locator(".pi-volume-off")).toBeAttached();
    await expect(btn.locator(".pi-volume-up")).not.toBeAttached();
    await expect(btn).not.toHaveClass(/active/);
  });

  test("clicking mute button unmutes the video and shows volume-up icon", async ({
    page,
  }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-mute-btn");
    await btn.click();

    await expect(btn.locator(".pi-volume-up")).toBeAttached({ timeout: 3_000 });
    await expect(btn.locator(".pi-volume-off")).not.toBeAttached();
    await expect(btn).toHaveClass(/active/);

    const video = firstSlide.getByTestId("feed-slide-video");
    await expect(video).toHaveJSProperty("muted", false, { timeout: 3_000 });
  });

  test("clicking mute button again remutes the video", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const btn = firstSlide.getByTestId("feed-slide-mute-btn");
    await btn.click();
    await expect(btn).toHaveClass(/active/, { timeout: 3_000 });

    await btn.click();
    await expect(btn).not.toHaveClass(/active/, { timeout: 3_000 });
    await expect(btn.locator(".pi-volume-off")).toBeAttached();
    const video = firstSlide.getByTestId("feed-slide-video");
    await expect(video).toHaveJSProperty("muted", true);
  });

  test("unmute preference persists across page reload", async ({ page }) => {
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    // Click to unmute (default is muted)
    await firstSlide.getByTestId("feed-slide-mute-btn").click();
    await expect(firstSlide.getByTestId("feed-slide-mute-btn")).toHaveClass(
      /active/,
      { timeout: 3_000 },
    );

    await page.reload();
    const reloadedSlide = page.getByTestId("feed-slide").first();
    await expect(reloadedSlide).toBeVisible({ timeout: 15_000 });
    await expect(reloadedSlide.getByTestId("feed-slide-mute-btn")).toHaveClass(
      /active/,
      { timeout: 5_000 },
    );
    const video = reloadedSlide.getByTestId("feed-slide-video");
    await expect(video).toHaveJSProperty("muted", false, { timeout: 3_000 });
  });
});
