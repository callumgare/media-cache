import { expect, test } from "./fixtures";
import { createAndRunQuery, makeImageMedia, setup } from "./helpers";

// ---------------------------------------------------------------------------
// Favourites filter – e2e
// ---------------------------------------------------------------------------

test.describe("Favourites filter", () => {
  test.beforeEach(async ({ request }) => {
    await setup(
      { request },
      {
        media: [
          [
            makeImageMedia({ id: "fav-1", title: "Fav Media 1" }),
            makeImageMedia({ id: "fav-2", title: "Fav Media 2" }),
            makeImageMedia({ id: "fav-3", title: "Fav Media 3" }),
          ],
        ],
      },
    );
    await createAndRunQuery({ request });
  });

  test("favouriting an item and filtering by 'Yes' shows only that item", async ({
    page,
  }) => {
    // Go to the feed and favourite the first slide
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const favBtn = firstSlide.getByTestId("feed-slide-favourite-btn");
    await expect(favBtn).toBeVisible({ timeout: 5_000 });
    await favBtn.click();

    // Go to grid view
    await page.goto("/media/grid");
    const items = page.locator("[data-media-id]");
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(items).toHaveCount(3, { timeout: 10_000 });

    // Find the "Favourited" filter row in the sidebar
    const sidebar = page.getByTestId("page-sidebar");
    const favouritedRow = sidebar.locator(".root", {
      has: page.locator("label", { hasText: "Favourited" }),
    });

    // Click "Yes" button in the SelectButton widget
    await favouritedRow.locator(".p-togglebutton", { hasText: "Yes" }).click();

    // Only 1 item should be shown
    await expect(items).toHaveCount(1, { timeout: 10_000 });
  });

  test("filtering by 'No' shows only non-favourited items", async ({
    page,
  }) => {
    // Go to the feed and favourite the first slide
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });

    const favBtn = firstSlide.getByTestId("feed-slide-favourite-btn");
    await expect(favBtn).toBeVisible({ timeout: 5_000 });
    await favBtn.click();

    // Go to grid view
    await page.goto("/media/grid");
    const items = page.locator("[data-media-id]");
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(items).toHaveCount(3, { timeout: 10_000 });

    // Find the "Favourited" filter row in the sidebar
    const sidebar = page.getByTestId("page-sidebar");
    const favouritedRow = sidebar.locator(".root", {
      has: page.locator("label", { hasText: "Favourited" }),
    });

    // Click "No" button in the SelectButton widget
    await favouritedRow.locator(".p-togglebutton", { hasText: "No" }).click();

    // 2 items should be shown (the non-favourited ones)
    await expect(items).toHaveCount(2, { timeout: 10_000 });
  });

  test("clearing the filter after selecting 'Yes' shows all items", async ({
    page,
  }) => {
    // Favourite the first slide
    await page.goto("/media/feed");
    const firstSlide = page.getByTestId("feed-slide").first();
    await expect(firstSlide).toBeVisible({ timeout: 15_000 });
    await firstSlide.getByTestId("feed-slide-favourite-btn").click();

    // Go to grid and apply "Yes" filter
    await page.goto("/media/grid");
    const items = page.locator("[data-media-id]");
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(items).toHaveCount(3, { timeout: 10_000 });

    const sidebar = page.getByTestId("page-sidebar");
    const favouritedRow = sidebar.locator(".root", {
      has: page.locator("label", { hasText: "Favourited" }),
    });
    await favouritedRow.locator(".p-togglebutton", { hasText: "Yes" }).click();
    await expect(items).toHaveCount(1, { timeout: 10_000 });

    // Clear the filter by clicking the clear button (×) next to the SelectButton
    const clearBtn = favouritedRow.locator('[aria-label="Clear"]');
    await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    await clearBtn.click();

    // All 3 items should be visible again
    await expect(items).toHaveCount(3, { timeout: 10_000 });
  });
});
