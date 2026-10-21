import { test, expect, type Page } from '@playwright/test'

// Credentials for the dedicated KMA test account — never hardcode these.
// See tests/e2e/README.md for where they come from.
export function requireCreds() {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD to run the E2E suite — see tests/e2e/README.md')
  }
  return { email, password }
}

/** Logs in, handling the "already signed in elsewhere" takeover prompt — the
 *  test account only gets one concurrent session, same as every real user,
 *  so a previous run's session (local or CI) not having closed yet is a
 *  routine case here, not an edge case. Generous timeout on the takeover
 *  button: it only renders after the login POST's 409 comes back and the
 *  app reacts to it, which is slower over a real network than localhost.
 *
 *  Used directly only by global-setup.ts (once per run) and auth.spec.ts
 *  (which is specifically testing login) — every other spec file is
 *  already authenticated via the shared storageState those two produce;
 *  see playwright.config.ts. */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  const response = page.waitForResponse(r => r.url().includes('/auth/api/v1/auth/login'))
  await page.click('button[type="submit"]')
  await response
  const takeOver = page.getByRole('button', { name: /sign out the other device/i })
  if (await takeOver.isVisible({ timeout: 10000 }).catch(() => false)) {
    await takeOver.click()
  }
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 })
}

/** Navigates to an authenticated route in a context loaded from the shared
 *  storageState (see playwright.config.ts). Needs one extra step first:
 *  src/utils/tabSession.ts treats "no sessionStorage tab marker and no
 *  other tab answers on the BroadcastChannel" as proof KMA was fully closed
 *  and reopened, and proactively ends the leftover session — correct,
 *  deliberate behavior for a real browser, but storageState only captures
 *  localStorage, never sessionStorage, so every fresh test context looks
 *  exactly like a closed-and-reopened KMA and gets logged out on its very
 *  first load. Seeding the same sessionStorage marker a real continued
 *  visit would have (tabSession.ts's TAB_KEY) avoids that false positive
 *  without touching the app's own, correct logic. */
export async function gotoAuthed(page: Page, path: string) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('kma-signed-in-tab', '1')
    // Also refreshed so it's within tabSession.ts's 2-minute staleness
    // window regardless of how long ago global-setup actually ran.
    window.localStorage.setItem('kma-open-at', String(Date.now()))
  })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

export async function logout(page: Page) {
  const csrf = (await page.context().cookies()).find(c => c.name === 'kma_csrf')?.value
  const res = await page.request.post('/auth/api/v1/auth/logout', {
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
  }).catch(() => null)
  if (!res || !res.ok()) {
    console.warn(`logout did not return ok (${res?.status() ?? 'no response'})`)
  }
}

export { test, expect }
