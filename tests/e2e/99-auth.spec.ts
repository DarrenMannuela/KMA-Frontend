// These specifically need to start logged out, so they opt out of the
// shared authenticated storageState every other spec file uses by default
// (see playwright.config.ts + global-setup.ts) — testing login itself is
// the point here, including the one fresh login each of these genuinely
// needs to do.
import { test, expect } from '@playwright/test'
import { requireCreds, login, logout } from './fixtures'

test.use({ storageState: { cookies: [], origins: [] } })

test('wrong password shows an error and does not navigate away from /login', async ({ page }) => {
  const { email } = requireCreds()
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', 'definitely-the-wrong-password')
  await page.click('button[type="submit"]')
  await expect(page.getByText(/incorrect|invalid|wrong/i)).toBeVisible({ timeout: 10000 })
  await expect(page).toHaveURL(/\/login/)
})

test('correct credentials land on the dashboard', async ({ page }) => {
  const { email, password } = requireCreds()
  await login(page, email, password)
  await expect(page).not.toHaveURL(/\/login/)
  await logout(page)
})

test('dark mode toggle persists across a reload', async ({ page }) => {
  const { email, password } = requireCreds()
  await login(page, email, password)

  const html = page.locator('html')
  const startedDark = (await html.getAttribute('class'))?.includes('dark') ?? false
  const toggle = page.locator(`header button[title="${startedDark ? 'Switch to light mode' : 'Switch to dark mode'}"]`)
  await toggle.click()
  await expect(html).toHaveClass(startedDark ? /^((?!dark).)*$/ : /dark/)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(html).toHaveClass(startedDark ? /^((?!dark).)*$/ : /dark/)

  // Leave the toggle as found.
  await page.locator(`header button[title="${startedDark ? 'Switch to dark mode' : 'Switch to light mode'}"]`).click()

  await logout(page)
})
