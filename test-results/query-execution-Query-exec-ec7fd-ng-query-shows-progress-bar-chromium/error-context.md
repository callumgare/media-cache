# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: query-execution.spec.ts >> Query execution feedback >> expanding a running query shows progress bar
- Location: tests/e2e/query-execution.spec.ts:98:3

# Error details

```
PostgresError: database "media_cache_test" is being accessed by other users
```

```
Error: locator.click: Test ended.
Call log:
  - waiting for getByRole('button', { name: 'Run' }).first()

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - menubar [ref=e7]:
          - menuitem "Media" [ref=e8]:
            - link "Media" [ref=e10] [cursor=pointer]:
              - /url: /
              - generic [ref=e11]: Media
          - menuitem "Groups" [ref=e12]:
            - link "Groups" [ref=e14] [cursor=pointer]:
              - /url: /
              - generic [ref=e15]: Groups
          - menuitem "Settings" [ref=e16]:
            - link "Settings" [ref=e18] [cursor=pointer]:
              - /url: /admin
              - generic [ref=e19]: Settings
        - generic [ref=e20]:
          - button "Debug" [ref=e21]
          - button "Randomise" [ref=e22]
      - separator [ref=e23]
      - generic [ref=e24]:
        - navigation [ref=e25]:
          - list [ref=e26]:
            - listitem [ref=e27]:
              - link "Settings" [ref=e28] [cursor=pointer]:
                - /url: /admin
                - generic [ref=e29]: Settings
            - listitem [ref=e30]:
              - img [ref=e31]
        - heading "Queries" [level=1] [ref=e33]
    - generic [ref=e35]:
      - table [ref=e38]:
        - rowgroup [ref=e39]:
          - row "ID Source Query Type Request Options Status Actions" [ref=e40]:
            - columnheader [ref=e41]
            - columnheader "ID" [ref=e42]:
              - generic [ref=e44]: ID
            - columnheader "Source" [ref=e45]:
              - generic [ref=e47]: Source
            - columnheader "Query Type" [ref=e48]:
              - generic [ref=e50]: Query Type
            - columnheader "Request Options" [ref=e51]:
              - generic [ref=e53]: Request Options
            - columnheader "Status" [ref=e54]:
              - generic [ref=e56]: Status
            - columnheader "Actions" [ref=e57]:
              - generic [ref=e59]: Actions
        - rowgroup [ref=e60]:
          - 'row "Row Expanded 4 test-source test-handler {} Never run Run Edit Delete" [ref=e61]':
            - cell "Row Expanded" [ref=e62]:
              - button "Row Expanded" [expanded] [active] [ref=e63] [cursor=pointer]:
                - img [ref=e64]
            - cell "4" [ref=e66]
            - cell "test-source" [ref=e67]
            - cell "test-handler" [ref=e68]
            - 'cell "{}" [ref=e69]'
            - cell "Never run" [ref=e70]:
              - generic [ref=e71]: Never run
            - cell "Run Edit Delete" [ref=e72]:
              - button "Run" [ref=e73] [cursor=pointer]
              - link "Edit" [ref=e74] [cursor=pointer]:
                - /url: /admin/queries/4
              - button "Delete" [ref=e75] [cursor=pointer]
          - row "This query has never been run." [ref=e76]:
            - cell "This query has never been run." [ref=e77]:
              - paragraph [ref=e79]: This query has never been run.
      - link "Add query +" [ref=e80] [cursor=pointer]:
        - /url: /admin/queries/add
  - generic:
    - img
  - generic [ref=e81]:
    - button "Toggle Nuxt DevTools" [ref=e82] [cursor=pointer]:
      - img [ref=e83]
    - generic "Page load time" [ref=e86]:
      - generic [ref=e87]: "99"
      - generic [ref=e88]: ms
    - button "Toggle Component Inspector" [ref=e90] [cursor=pointer]:
      - img [ref=e91]
```

# Test source

```ts
  8   | function makeMedia(overrides: Partial<GenericMedia> = {}): GenericMedia {
  9   |   const id = overrides.id ?? Math.random().toString(36).slice(2)
  10  |   return {
  11  |     mediaFinderSource: 'test-source',
  12  |     id,
  13  |     files: [
  14  |       {
  15  |         type: 'main',
  16  |         url: `https://example.com/media-${id}.mp4`,
  17  |         video: true,
  18  |         audio: false,
  19  |         image: false,
  20  |       },
  21  |     ],
  22  |     ...overrides,
  23  |   }
  24  | }
  25  | 
  26  | const TEST_REQUEST = { source: 'test-source', queryType: 'test-handler' }
  27  | 
  28  | async function setup(
  29  |   { request }: { request: import('@playwright/test').APIRequestContext },
  30  |   opts: { media?: GenericMedia[][], delay?: number } = {},
  31  | ) {
  32  |   const res = await request.post('/api/_test/setup', { data: { media: opts.media ?? [], delay: opts.delay ?? 0 } })
  33  |   if (!res.ok()) throw new Error(`Test setup failed: ${res.status()} ${await res.text()}`)
  34  | }
  35  | 
  36  | async function createQuery(
  37  |   { request }: { request: import('@playwright/test').APIRequestContext },
  38  |   opts: { name?: string } = {},
  39  | ) {
  40  |   const res = await request.post('/api/admin/queries', {
  41  |     data: {
  42  |       title: opts.name ?? 'Test Query',
  43  |       schedule: 0,
  44  |       requestOptions: TEST_REQUEST,
  45  |     },
  46  |   })
  47  |   if (!res.ok()) throw new Error(`Failed to create query: ${res.status()} ${await res.text()}`)
  48  |   return res.json() as Promise<{ id: number }>
  49  | }
  50  | 
  51  | // ---------------------------------------------------------------------------
  52  | // Tests
  53  | // ---------------------------------------------------------------------------
  54  | 
  55  | test.describe('Query execution feedback', () => {
  56  |   test('status badge shows skeleton while tasks are loading, then shows Never run', async ({ page, request }) => {
  57  |     await setup({ request })
  58  |     await createQuery({ request })
  59  | 
  60  |     await page.goto('/admin/queries')
  61  | 
  62  |     // Initially the status column should show a skeleton (tasks not yet loaded)
  63  |     const skeleton = page.locator('.p-skeleton').first()
  64  |     await expect(skeleton).toBeVisible()
  65  | 
  66  |     // Once tasks have loaded the skeleton goes away and "Never run" appears
  67  |     const badge = page.locator('.status-badge').first()
  68  |     await expect(badge).toHaveText('Never run', { timeout: 10_000 })
  69  |   })
  70  | 
  71  |   test('clicking Run changes status badge to Running…', async ({ page, request }) => {
  72  |     await setup({ request }, { media: [[makeMedia({ id: 'a' }), makeMedia({ id: 'b' })]], delay: 3_000 })
  73  |     await createQuery({ request })
  74  | 
  75  |     await page.goto('/admin/queries')
  76  | 
  77  |     // Wait for tasks to load (skeleton disappears)
  78  |     await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })
  79  | 
  80  |     await page.getByRole('button', { name: 'Run' }).first().click()
  81  | 
  82  |     await expect(page.locator('.status-badge').first()).toHaveText('Running…', { timeout: 5_000 })
  83  |   })
  84  | 
  85  |   test('status badge changes to Completed after query finishes', async ({ page, request }) => {
  86  |     await setup({ request }, { media: [[makeMedia({ id: 'c' }), makeMedia({ id: 'd' })]] })
  87  |     await createQuery({ request })
  88  | 
  89  |     await page.goto('/admin/queries')
  90  |     await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })
  91  | 
  92  |     await page.getByRole('button', { name: 'Run' }).first().click()
  93  | 
  94  |     // Wait for Completed — proves task.completed SSE event was received without a page reload
  95  |     await expect(page.locator('.status-badge').first()).toHaveText('Completed', { timeout: 30_000 })
  96  |   })
  97  | 
  98  |   test('expanding a running query shows progress bar', async ({ page, request }) => {
  99  |     await setup({ request }, { media: [[makeMedia({ id: 'e' })]], delay: 3_000 })
  100 |     await createQuery({ request })
  101 | 
  102 |     await page.goto('/admin/queries')
  103 |     await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })
  104 | 
  105 |     // Expand the row before running so we can see live progress
  106 |     await page.locator('.p-datatable-row-toggle-button').first().click()
  107 | 
> 108 |     await page.getByRole('button', { name: 'Run' }).first().click()
      |                                                             ^ Error: locator.click: Test ended.
  109 | 
  110 |     // Live execution view should appear in the expanded row
  111 |     await expect(page.locator('.mode-live').first()).toBeVisible({ timeout: 5_000 })
  112 |   })
  113 | 
  114 |   test('completed execution details show media counts', async ({ page, request }) => {
  115 |     await setup({ request }, { media: [[makeMedia({ id: 'f' }), makeMedia({ id: 'g' })]] })
  116 |     await createQuery({ request })
  117 | 
  118 |     await page.goto('/admin/queries')
  119 |     await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })
  120 | 
  121 |     // Expand first
  122 |     await page.locator('.p-datatable-row-toggle-button').first().click()
  123 | 
  124 |     await page.getByRole('button', { name: 'Run' }).first().click()
  125 | 
  126 |     // Wait for completion
  127 |     await expect(page.locator('.status-badge').first()).toHaveText('Completed', { timeout: 30_000 })
  128 | 
  129 |     // Execution details should show media counts
  130 |     const details = page.locator('.execution-details')
  131 |     await expect(details.getByText(/Found:/)).toBeVisible()
  132 |     await expect(details.getByText(/New:/)).toBeVisible()
  133 |   })
  134 | 
  135 |   test('site header shows running execution indicator while query runs', async ({ page, request }) => {
  136 |     await setup({ request }, { media: [[makeMedia({ id: 'h' })]], delay: 3_000 })
  137 |     await createQuery({ request })
  138 | 
  139 |     await page.goto('/admin/queries')
  140 |     await expect(page.locator('.status-badge').first()).toBeVisible({ timeout: 10_000 })
  141 | 
  142 |     await page.getByRole('button', { name: 'Run' }).first().click()
  143 | 
  144 |     // Header should show a running indicator
  145 |     await expect(page.locator('.execution-indicator')).toBeVisible({ timeout: 5_000 })
  146 |   })
  147 | })
  148 | 
```