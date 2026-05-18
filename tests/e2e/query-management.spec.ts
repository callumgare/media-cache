import { expect, test } from "./fixtures";
import {
  collectConsoleProblems,
  createAndRunQuery,
  createQuery,
  makeVideoMedia,
  setup,
} from "./helpers";

// ---------------------------------------------------------------------------
// Query management – admin UI for creating, editing and running queries
// ---------------------------------------------------------------------------

test.describe("Query management", () => {
  test("query list shows initial state with skeleton then Never run badge, with no console errors", async ({
    page,
    request,
  }) => {
    await setup({ request });
    await createQuery({ request });

    const problems = collectConsoleProblems(page);
    await page.goto("/admin/queries");

    // Tasks data loads asynchronously so the status column starts as a skeleton
    const skeleton = page.locator(".p-skeleton").first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 });

    // Once tasks have loaded the skeleton disappears and "Never run" appears
    const badge = page.getByTestId("status-badge").first();
    await expect(badge).toHaveText("Never run", { timeout: 10_000 });

    expect(
      problems,
      "No console errors or warnings on query list page",
    ).toEqual([]);
  });

  test("full query lifecycle: run triggers live status updates through to completion with execution details", async ({
    page,
    request,
  }) => {
    // Use a 3-second delay so there is time to observe the Running… state
    await setup(
      { request },
      {
        media: [[makeVideoMedia({ id: "a" }), makeVideoMedia({ id: "b" })]],
        delay: 3_000,
      },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    // Expand the row before running to see live progress in the expanded view
    await page.locator(".p-datatable-row-toggle-button").first().click();

    // Click Run
    await page.getByRole("button", { name: "Run" }).first().click();

    // Status badge should immediately change to Running…
    await expect(page.getByTestId("status-badge").first()).toHaveText(
      "Running…",
      { timeout: 5_000 },
    );

    // Site header shows a running execution indicator
    await expect(page.getByTestId("execution-indicator")).toBeVisible({
      timeout: 5_000,
    });

    // Expanded row shows a live progress section
    await expect(page.getByTestId("progress-section").first()).toBeVisible({
      timeout: 5_000,
    });

    // Wait for the query to complete (proves SSE task.completed event was received)
    await expect(page.getByTestId("status-badge").first()).toHaveText(
      "Completed",
      { timeout: 30_000 },
    );

    // Execution details in the expanded row show media counts
    const details = page.getByTestId("execution-details");
    await expect(details.getByText(/Found/)).toBeVisible();
    await expect(details.getByText(/New/)).toBeVisible();
  });

  test("editing a saved query updates its configuration", async ({
    page,
    request,
  }) => {
    await setup({ request });
    const { id } = await createQuery({ request });

    // Navigate from the query list to the edit page via the Edit link
    await page.goto("/admin/queries");
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page.getByRole("heading", { name: "Edit Query" })).toBeVisible(
      { timeout: 10_000 },
    );

    // Wait for the client-side fetch to finish (loading spinners disappear)
    await expect(page.locator(".p-select-loading-icon")).toHaveCount(0, {
      timeout: 10_000,
    });
    const sourceLabel = page
      .getByTestId("source-select")
      .locator(".p-select-label");
    await expect(sourceLabel).toHaveText("Test Source", { timeout: 5_000 });

    // Reload the page directly (cold SSR load) and verify no console errors
    const problems = collectConsoleProblems(page);
    await page.goto(`/admin/queries/${id}`);
    await expect(page.getByRole("heading", { name: "Edit Query" })).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(page.locator(".p-select-loading-icon")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(sourceLabel).toHaveText("Test Source", { timeout: 5_000 });
    expect(
      problems,
      "No console errors or warnings on direct page load",
    ).toEqual([]);

    // Change the handler to one with a keyword field and save
    const requestHandlerSelect = page
      .locator("#requestHandlerInput")
      .locator("xpath=ancestor::div[contains(@class,'p-select')][1]");
    await requestHandlerSelect.click();
    const overlay = page.locator(".p-select-overlay");
    await overlay
      .locator(".p-select-option", { hasText: "Test Handler With Keyword" })
      .click();
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });

    await page.locator("#keyword").fill("my-test-keyword");
    await page.getByRole("button", { name: "Save" }).click();

    // Save navigates back to the query list
    await expect(page).toHaveURL(/\/admin\/queries(#[^?]*)?$/, {
      timeout: 10_000,
    });

    // The updated keyword is visible in the Request Options column
    const row = page.locator(`#query-${id}`);
    await expect(
      row.locator(".request-option", { hasText: "keyword" }),
    ).toContainText("my-test-keyword", { timeout: 5_000 });
  });
});
