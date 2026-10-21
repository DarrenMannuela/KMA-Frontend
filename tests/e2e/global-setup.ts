import { chromium, type FullConfig } from '@playwright/test'
import { requireCreds, login } from './fixtures'

// Logs in once for the whole run and saves the session to disk; every spec
// file loads it via playwright.config.ts's `use.storageState` instead of
// logging in itself. This isn't just an optimization — logging in fresh per
// test is exactly the repeated-POST-to-/login pattern the backend's own
// rate limiter (KMA-Auth, added this session) exists to slow down, and a
// full suite doing that across several spec files reliably tripped it.
// auth.spec.ts still logs in for real, since testing login IS its job —
// see its own `test.use({ storageState: ... })` override.
export default async function globalSetup(config: FullConfig) {
  const { email, password } = requireCreds()
  const baseURL = config.projects[0].use.baseURL
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })
  await login(page, email, password)
  await page.context().storageState({ path: 'tests/e2e/.auth/state.json' })
  await browser.close()
}
