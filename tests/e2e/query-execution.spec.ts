import { test, expect } from '@playwright/test'
import type { GenericMedia } from 'media-finder'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2)
  return {
    mediaFinderSource: 'test-source',
    id,
    files: [
      {
        type: 'main',
        url: `https://example.com/media-${id}.mp4`,
        video: true,
        audio: false,
        image: false,
      },
    ],
    ...overrides,
  }
}

const TEST_REQUEST = { source: 'test-source', queryType: 'test-handler' }

async function setup(
  { request }: { request: ReturnType<typeof test.info>['request'] extends never ? never : import('@playwright/test').APIRequestContext },
  opts: { media?: GenericMedia[][], delay?: number } = {},
) {
  const res = await request.post('/api/_test/setup', { data: { media: opts.media ?? [], delay: opts.delay ?? 0 } })
  if (!res.ok()) throw new Error(`Test setup failed: ${res.status()} ${await res.text()}`)
}

async function createQuery(
  { request }: { request: import('@playwright/test').APIRequestContext },
  opts: { name?: string } = {},
) {
  const res = await request.post('/api/admin/queries', {
    data: {
      title: opts.name ?? 'Test Query',
      schedule: 0,
      requestOptions: TEST_REQUEST,
    },
  })
  if (!res.ok()) throw new Error(`Failed to create query: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{ id: number }>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Query execution feedback', () => {
  test('status badge shows skeleton while tasks are loading, then shows Never run', async ({ page, request }) => {
    await setup({ request })
    await createQuery({ request })

    await page.goto('/admin/queries')

    // Initially the status column should show a skeleton (tasks not yet loaded)
    const skeleton = page.locator('.p-skeleton').first()
    await expect(skeleton).toBeVisible()

    // Once tasks have loaded the skeleton goes away and "Never run" appears
    const badge = page.locator('.status-badge').first()
    await expect(badge).toHaveText('Never run', { timeout: 10_000 })
  })

  test('clicking Run changes status badge to Running…', async ({ page, request }) => {
    await setup({ request }, { media: [[makeMedia({ id: 'a' }), makeMedia({ id: 'b' })]], delay: 3_000 })
    await createQuery({ request })

    await page.goto('/admin/queries')

    // Wait for tasks to load (skeleton disappears)
    await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Run' }).first().click()

    await expect(page.locator('.status-badge').first()).toHaveText('Running…', { timeout: 5_000 })
  })

  test('status badge changes to Completed after query finishes', async ({ page, request }) => {
    await setup({ request }, { media: [[makeMedia({ id: 'c' }), makeMedia({ id: 'd' })]] })
    await createQuery({ request })

    await page.goto('/admin/queries')
    await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Run' }).first().click()

    // Wait for Completed — proves task.completed SSE event was received without a page reload
    await expect(page.locator('.status-badge').first()).toHaveText('Completed', { timeout: 30_000 })
  })

  test('expanding a running query shows progress bar', async ({ page, request }) => {
    await setup({ request }, { media: [[makeMedia({ id: 'e' })]], delay: 3_000 })
    await createQuery({ request })

    await page.goto('/admin/queries')
    await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })

    // Expand the row before running so we can see live progress
    await page.locator('.p-datatable-row-toggle-button').first().click()

    await page.getByRole('button', { name: 'Run' }).first().click()

    // Live execution view should appear in the expanded row
    await expect(page.locator('.mode-live').first()).toBeVisible({ timeout: 5_000 })
  })

  test('completed execution details show media counts', async ({ page, request }) => {
    await setup({ request }, { media: [[makeMedia({ id: 'f' }), makeMedia({ id: 'g' })]] })
    await createQuery({ request })

    await page.goto('/admin/queries')
    await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })

    // Expand first
    await page.locator('.p-datatable-row-toggle-button').first().click()

    await page.getByRole('button', { name: 'Run' }).first().click()

    // Wait for completion
    await expect(page.locator('.status-badge').first()).toHaveText('Completed', { timeout: 30_000 })

    // Execution details should show media counts
    const details = page.locator('.execution-details')
    await expect(details.getByText(/Found:/)).toBeVisible()
    await expect(details.getByText(/New:/)).toBeVisible()
  })

  test('site header shows running execution indicator while query runs', async ({ page, request }) => {
    await setup({ request }, { media: [[makeMedia({ id: 'h' })]], delay: 3_000 })
    await createQuery({ request })

    await page.goto('/admin/queries')
    await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Run' }).first().click()

    // Header should show a running indicator
    await expect(page.locator('.execution-indicator')).toBeVisible({ timeout: 5_000 })
  })
})
