import type { GenericMedia } from "@liase/core";
import { expect, test } from "@playwright/test";
import { collectConsoleProblems } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `https://example.com/media-${id}.mp4`,
        video: true,
        audio: false,
        image: false,
      },
    ],
    ...overrides,
  };
}

const TEST_REQUEST = { source: "test-source", queryType: "test-handler" };

async function setup(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: { media?: GenericMedia[][]; delay?: number } = {},
) {
  const res = await request.post("/api/_test/setup", {
    data: { media: opts.media ?? [], delay: opts.delay ?? 0 },
  });
  if (!res.ok())
    throw new Error(`Test setup failed: ${res.status()} ${await res.text()}`);
}

async function createQuery(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: { name?: string } = {},
) {
  const res = await request.post("/api/admin/queries", {
    data: {
      title: opts.name ?? "Test Query",
      schedule: 0,
      requestOptions: TEST_REQUEST,
    },
  });
  if (!res.ok())
    throw new Error(
      `Failed to create query: ${res.status()} ${await res.text()}`,
    );
  return res.json() as Promise<{ id: number }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Query execution feedback", () => {
  test("status badge shows skeleton while tasks are loading, then shows Never run", async ({
    page,
    request,
  }) => {
    await setup({ request });
    await createQuery({ request });

    const problems = collectConsoleProblems(page);
    await page.goto("/admin/queries");

    // Initially the status column should show a skeleton (tasks not yet loaded)
    const skeleton = page.locator(".p-skeleton").first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 });

    // Once tasks have loaded the skeleton goes away and "Never run" appears
    const badge = page.getByTestId("status-badge").first();
    await expect(badge).toHaveText("Never run", { timeout: 10_000 });

    expect(
      problems,
      "No console errors or warnings on query list page",
    ).toEqual([]);
  });

  test("edit a saved query", async ({ page, request }) => {
    await setup({ request });
    const { id } = await createQuery({ request });

    // --- Step 1: navigate from the query list to the edit page ---
    await page.goto("/admin/queries");
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page.getByRole("heading", { name: "Edit Query" })).toBeVisible(
      { timeout: 10_000 },
    );

    // Wait for the client-side fetch to finish (loading spinners disappear)
    await expect(page.locator(".p-select-loading-icon")).toHaveCount(0, {
      timeout: 10_000,
    });
    // Confirm the saved source value is shown in the source field
    const sourceLabel = page
      .getByTestId("source-select")
      .locator(".p-select-label");
    await expect(sourceLabel).toHaveText("Test Source", { timeout: 5_000 });

    // --- Step 2: reload the page directly (cold SSR load) and check for console problems ---
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

    // --- Step 3: change the request handler to one with a keyword field,
    //     fill in a keyword, and save ---
    const requestHandlerSelect = page
      .locator("#requestHandlerInput")
      .locator("xpath=ancestor::div[contains(@class,'p-select')][1]");
    await requestHandlerSelect.click();
    const overlay = page.locator(".p-select-overlay");
    await overlay
      .locator(".p-select-option", { hasText: "Test Handler With Keyword" })
      .click();
    // Wait for the overlay to close before interacting with the form
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });

    await page.locator("#keyword").fill("my-test-keyword");

    await page.getByRole("button", { name: "Save" }).click();

    // Save navigates back to the query list (URL includes a #query-N anchor)
    await expect(page).toHaveURL(/\/admin\/queries(#[^?]*)?$/, {
      timeout: 10_000,
    });

    // --- Step 4: confirm the updated keyword is visible in the Request Options column ---
    const row = page.locator(`#query-${id}`);
    await expect(
      row.locator(".request-option", { hasText: "keyword" }),
    ).toContainText("my-test-keyword", { timeout: 5_000 });
  });

  test("clicking Run changes status badge to Running…", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      {
        media: [[makeMedia({ id: "a" }), makeMedia({ id: "b" })]],
        delay: 3_000,
      },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");

    // Wait for tasks to load (skeleton disappears)
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Run" }).first().click();

    await expect(page.getByTestId("status-badge").first()).toHaveText(
      "Running…",
      {
        timeout: 5_000,
      },
    );
  });

  test("status badge changes to Completed after query finishes", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeMedia({ id: "c" }), makeMedia({ id: "d" })]] },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Run" }).first().click();

    // Wait for Completed — proves task.completed SSE event was received without a page reload
    await expect(page.getByTestId("status-badge").first()).toHaveText(
      "Completed",
      { timeout: 30_000 },
    );
  });

  test("expanding a running query shows progress bar", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeMedia({ id: "e" })]], delay: 3_000 },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    // Expand the row before running so we can see live progress
    await page.locator(".p-datatable-row-toggle-button").first().click();

    await page.getByRole("button", { name: "Run" }).first().click();

    // Live execution view should appear in the expanded row
    await expect(page.getByTestId("progress-section").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("completed execution details show media counts", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeMedia({ id: "f" }), makeMedia({ id: "g" })]] },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    // Expand first
    await page.locator(".p-datatable-row-toggle-button").first().click();

    await page.getByRole("button", { name: "Run" }).first().click();

    // Wait for completion
    await expect(page.getByTestId("status-badge").first()).toHaveText(
      "Completed",
      { timeout: 30_000 },
    );

    // Execution details should show media counts
    const details = page.getByTestId("execution-details");
    await expect(details.getByText(/Found/)).toBeVisible();
    await expect(details.getByText(/New/)).toBeVisible();
  });

  test("site header shows running execution indicator while query runs", async ({
    page,
    request,
  }) => {
    await setup(
      { request },
      { media: [[makeMedia({ id: "h" })]], delay: 3_000 },
    );
    await createQuery({ request });

    await page.goto("/admin/queries");
    await expect(page.getByTestId("status-badge").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Run" }).first().click();

    // Header should show a running indicator
    await expect(page.getByTestId("execution-indicator")).toBeVisible({
      timeout: 5_000,
    });
  });
});
