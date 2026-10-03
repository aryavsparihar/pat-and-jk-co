import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

// Never send real email from a test run: blank, not deleted, so neither Next nor dotenv fills it
// in again from .env. The app server and the test workers inherit this, and without a key every
// email is written to the log instead. tests/helpers/e2e.ts refuses to run if one is set.
process.env.RESEND_API_KEY = ''
// Nor ask Cloudflare: without the Turnstile keys the widget stays off and the server skips its
// check (src/security/turnstile.ts)
process.env.TURNSTILE_SECRET_KEY = ''
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ''

/**
 * End-to-end tests (tests/e2e), against the real app and a database the tests may change. In CI
 * that is a throwaway Postgres, migrated and seeded first (.github/workflows/ci.yml); locally it
 * is your development database, and the tests remove everything they make (tests/helpers/e2e.ts).
 *
 * The app runs as `pnpm dev`: emails are written to the log rather than sent, which is what lets
 * a test sign in with a code it set itself.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // One at a time: the tests share one database and one applications switch
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A development server compiles each page the first time it is visited
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    navigationTimeout: 90_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        // A browser already on this machine, instead of Playwright's own download
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: !process.env.CI,
    url: 'http://localhost:3000',
    timeout: 240_000,
    // The app's log in the test output: emails written there instead of sent, and any errors
    stdout: 'pipe',
  },
})
