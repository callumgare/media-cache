import { expect, test } from "./fixtures";
import { setup } from "./helpers";

// ---------------------------------------------------------------------------
// Groups page – infinite scroll
// Page size is 5; seed 30 items (6 full pages) to test that the infinite
// scroll does not auto-load everything without user scrolling.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 5;
const TOTAL_GROUPS = 30; // 6 pages worth

test.describe("Groups page – infinite scroll", () => {
  // 800×600 fits roughly one page of group cards without overflow
  test.use({ viewport: { width: 800, height: 600 } });

  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        pageSize: PAGE_SIZE,
        groups: Array.from({ length: TOTAL_GROUPS }, (_, i) => ({
          name: `Group ${String(i + 1).padStart(3, "0")}`,
        })),
      },
    );
  });

  /**
   * Intercepts /api/groups so the next matching request is held until the
   * returned `release()` function is called. Subsequent requests pass through.
   */
  async function holdNextGroupsRequest(page: import("@playwright/test").Page) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/groups*", async (route) => {
      await released;
      await route.continue();
      await page.unroute("**/api/groups*");
    });

    return release;
  }

  test("does not continuously load all pages without scrolling", async ({
    page,
  }) => {
    const release = await holdNextGroupsRequest(page);
    await page.goto("/groups");

    const cards = page.locator(".group-card");
    const loadingIndicator = page.getByText("Loading\u2026"); // "Loading…"

    // First request is held — confirm loading indicator is visible
    await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });

    // Release the request and wait for loading to settle
    release();
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });

    // Wait to confirm auto-fill does not immediately trigger a second load.
    // 2 s gives the infinite-scroll observer enough time to fire on slow CI.
    await page.waitForTimeout(2_000);
    await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

    const count = await cards.count();
    // Should have loaded at least 1 card but not all 30
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(TOTAL_GROUPS);
  });

  test("scrolling to the bottom loads the next page", async ({ page }) => {
    const releaseFirst = await holdNextGroupsRequest(page);
    await page.goto("/groups");

    const cards = page.locator(".group-card");
    const loadingIndicator = page.getByText("Loading\u2026");

    // Release first request and wait for it to settle
    await expect(loadingIndicator).toBeVisible({ timeout: 15_000 });
    releaseFirst();
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await expect(loadingIndicator).not.toBeVisible({ timeout: 5_000 });

    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThan(TOTAL_GROUPS);

    // Scroll to the bottom to trigger loading the next page
    await page.evaluate(() => {
      const container = document.querySelector(".base-layout-contents");
      if (container) container.scrollTo(0, container.scrollHeight);
    });

    await expect(cards).toHaveCount(initialCount + PAGE_SIZE, {
      timeout: 15_000,
    });
  });

  test("loading is triggered when viewport is enlarged to create free space", async ({
    page,
  }) => {
    // Override to a very short viewport so the first page of groups overflows
    // the container, preventing auto-fill from loading more than one page.
    await page.setViewportSize({ width: 800, height: 150 });
    await page.goto("/groups");

    const cards = page.locator(".group-card");

    // Wait for the first page to load and auto-fill to fully settle.
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    const countBefore = await cards.count();
    expect(countBefore).toBeGreaterThan(0);
    expect(countBefore).toBeLessThan(TOTAL_GROUPS);

    // Enlarge the viewport so all loaded groups fit with room to spare.
    // Use the actual scrollHeight of the scroll container to ensure we
    // resize to something definitively larger than the current content.
    const contentHeight = await page.evaluate(
      () =>
        (document.querySelector(".base-layout-contents") as HTMLElement)
          ?.scrollHeight ?? 2000,
    );
    await page.setViewportSize({ width: 800, height: contentHeight + 500 });

    // The infinite scroll should detect the extra space and load more groups.
    await expect(cards).not.toHaveCount(countBefore, { timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThan(countBefore);
  });
});
