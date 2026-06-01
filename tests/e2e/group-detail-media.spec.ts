import { expect, test } from "./fixtures";
import { collectConsoleProblems, setup } from "./helpers";

// ---------------------------------------------------------------------------
// Group detail page – media rendering
// Tests that a group with media loads and renders media items correctly.
// ---------------------------------------------------------------------------

test.describe("Group detail page – media rendering", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        groups: [{ name: "Test Group" }, { name: "Empty Group" }],
        groupMedia: [{ groupIndex: 0, count: 3 }],
      },
    );
  });

  test("loads a group with media and renders media items", async ({ page }) => {
    const problems = collectConsoleProblems(page);
    await page.goto("/groups/1");

    // Wait for the group name to be visible in breadcrumbs
    await expect(page.locator("text=Test Group")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for the media section to be visible
    const mediaSection = page.locator("text=Media").first();
    await expect(mediaSection).toBeVisible({ timeout: 10_000 });

    // Wait for media items to render
    const mediaItems = page.locator("[data-media-id]");
    await expect(mediaItems).toHaveCount(3, { timeout: 15_000 });

    expect(
      problems,
      "No console errors or warnings on group detail page",
    ).toEqual([]);
  });

  test("displays media items with images loaded", async ({ page }) => {
    await page.goto("/groups/1");

    // Wait for the group to load
    await expect(page.locator("text=Test Group")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for media section and items to render
    const mediaItems = page.locator("[data-media-id] img");
    await expect(mediaItems.first()).toBeVisible({ timeout: 15_000 });
    await expect(mediaItems).toHaveCount(3, { timeout: 15_000 });

    // Verify at least one image is loaded (has natural dimensions)
    const firstImage = mediaItems.first();
    const isLoaded = await firstImage.evaluate(
      (img: HTMLImageElement) => img.naturalHeight > 0 && img.naturalWidth > 0,
    );
    expect(isLoaded).toBe(true);
  });

  test("empty group does not show media section", async ({ page }) => {
    await page.goto("/groups/2");

    // Wait for the group name to be visible
    await expect(page.locator("text=Empty Group")).toBeVisible({
      timeout: 10_000,
    });

    // Media section should not be visible since the group has no media
    const mediaSection = page.locator("section", {
      has: page.locator("text=Media"),
    });
    await expect(mediaSection).not.toBeVisible({ timeout: 5_000 });
  });

  test("media section is not visible if group has no media count", async ({
    page,
  }) => {
    await page.goto("/groups/2");

    // The group detail page shows media section only if group?.mediaCount > 0
    const mediaSectionHeading = page.locator("h2", { hasText: "Media" });
    await expect(mediaSectionHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test("clicking 'Open on Media page' navigates to the media page with the group highlighted in the sidebar filter", async ({
    page,
  }) => {
    await page.goto("/groups/1");

    // Wait for group to load and media section to appear
    await expect(page.locator("text=Test Group").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("h2", { hasText: "Media" })).toBeVisible({
      timeout: 10_000,
    });

    // Click the button
    await page.locator('[data-testid="open-on-media-page-btn"]').click();

    // Should land on a media page
    await page.waitForURL(/\/media\//, { timeout: 10_000 });

    // The sidebar should be visible
    const sidebar = page.locator('[data-testid="page-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5_000 });

    // The groups filter should show "Test Group" as the selected item
    const selectedGroupItem = sidebar.locator(
      '[data-testid="listbox-selected-item"]',
    );
    await expect(selectedGroupItem).toBeVisible({ timeout: 5_000 });
    await expect(selectedGroupItem).toContainText("Test Group");
  });
});
