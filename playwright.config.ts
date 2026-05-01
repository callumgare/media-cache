import { resolve } from 'path'
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

loadEnv()

function toTestDbUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = '/media_cache_test'
  return parsed.toString()
}

const testDbUrl = toTestDbUrl(process.env.DATABASE_URL ?? 'postgresql://postgres:example@localhost:5432/postgres')
const testPluginPath = resolve('./tests/fixtures/test-plugin.ts')

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/setup/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3001',
  },
  // Run tests serially — they share a DB
  workers: 1,
  webServer: {
    command: `ENABLE_TEST_API=true DATABASE_URL=${testDbUrl} MEDIA_FINDER_PLUGINS=${testPluginPath} npx nuxt dev --port 3001`,
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
