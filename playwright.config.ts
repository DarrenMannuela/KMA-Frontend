import { defineConfig, devices } from '@playwright/test'

// These need a live KMA + KMA-Auth backend (sibling repos, not part of this
// checkout), so they're not wired into CI — see tests/e2e/README.md for how
// to run them locally/manually against a dev or deployed stack.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // the order-to-cash flow mutates shared data; serialize to avoid cross-test collisions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  // Logs in once for the whole run (see global-setup.ts) rather than per
  // test — repeated fresh logins across many tests trip KMA-Auth's own
  // login rate limiter, the same one this session added for real security
  // reasons. auth.spec.ts opts back out with its own storageState since
  // testing login itself is the point there.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
