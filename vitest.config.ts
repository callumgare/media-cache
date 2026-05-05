import { resolve } from 'path'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'

loadEnv()

function toTestDbUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = '/media_cache_test'
  return parsed.toString()
}

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    include: ['tests/unit/**/*.test.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    env: {
      DATABASE_URL: toTestDbUrl(process.env.DATABASE_URL ?? ''),
      MEDIA_FINDER_PLUGINS: resolve('./tests/unit/fixtures/test-plugin.ts'),
    },
    pool: 'forks',
    fileParallelism: false,
    onConsoleLog() {
      return false
    },
  },
  resolve: {
    // Default here: https://nuxt.com/docs/4.x/api/nuxt-config#alias
    alias: {
      '@': resolve('./app'),
      '~': resolve('./app'),
      '@@': resolve('.'),
      '~~': resolve('.'),
    },
  },
})
