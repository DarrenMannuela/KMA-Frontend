// Covers the start of the order-to-cash pipeline: a new client, then a new
// order linked to it. Intentionally scoped here rather than chasing the
// whole pipeline (items, invoice, delivery, Bukti Kas) in one go — see
// tests/e2e/README.md for why, and for how to extend this.
import { test, expect, gotoAuthed } from './fixtures'

// Timestamped so repeated runs (and CI runs, if this ever gets wired in)
// never collide with each other or with real data, and so leftover rows
// from a crashed run are unambiguous to find and delete by hand. Uppercase:
// both the Client Name and Order ID fields force uppercase as you type
// (UppercaseField), so matching text pulled from the rendered UI later
// (a <select>'s option label, a URL built from the saved id) needs to
// already be in the form the app will actually store and display.
const RUN_ID = Date.now().toString(36).toUpperCase()
const CLIENT_NAME = `E2E TEST CLIENT ${RUN_ID}`
const ORDER_ID = `E2E-${RUN_ID}`

test('create a client, then an order linked to it, then clean both up', async ({ page }) => {
  // ── Create the client ──────────────────────────────────────────────
  await gotoAuthed(page, '/clients')
  await page.getByRole('button', { name: /add new/i }).click()
  await page.getByPlaceholder('e.g. PT Sumber Makmur').fill(CLIENT_NAME)
  await page.getByRole('button', { name: /^add client$/i }).click()
  await expect(page.getByText(CLIENT_NAME)).toBeVisible({ timeout: 10000 })

  // ── Create an order linked to it ───────────────────────────────────
  await page.goto('/orders')
  await page.getByRole('button', { name: /add new/i }).click()
  const idField = page.getByPlaceholder('001/KMA/26')
  await idField.fill('')
  await idField.fill(ORDER_ID)
  await page.locator('select').first().selectOption({ label: CLIENT_NAME })
  // Company auto-fills from the selected client; Order Date defaults to today.
  await page.getByRole('button', { name: /^create order$/i }).click()
  // A successful create navigates to the order's own detail page.
  await page.waitForURL(new RegExp(`/orders/${ORDER_ID}`), { timeout: 10000 })
  await expect(page.getByText(CLIENT_NAME).first()).toBeVisible()

  // ── Clean up: delete the order, then the client ────────────────────
  await page.goto('/orders')
  // Orders search only covers company/po_number, not id (confirmed from
  // OrdersPage's searchKeys) — search by the client name that auto-filled
  // into Company when the client was selected above, not the order id.
  await page.getByPlaceholder(/search/i).fill(CLIENT_NAME)
  const orderRow = page.locator('tr', { hasText: ORDER_ID })
  await expect(orderRow).toBeVisible()
  await orderRow.locator('button:has(svg.lucide-trash2)').click()
  // Scoped to the dialog's own confirm button: the row's trash icon button
  // now also has an aria-label of "Delete" (a11y fix elsewhere in this
  // suite), which getByRole('button', { name: 'delete' }) would otherwise
  // also match.
  await page.locator('.btn-danger', { hasText: 'Delete' }).click()
  await expect(orderRow).not.toBeVisible()

  await page.goto('/clients')
  await page.getByPlaceholder(/search/i).fill(CLIENT_NAME)
  const clientRow = page.locator('tr', { hasText: CLIENT_NAME })
  await expect(clientRow).toBeVisible()
  await clientRow.locator('button:has(svg.lucide-trash2)').click()
  // Scoped to the dialog's own confirm button: the row's trash icon button
  // now also has an aria-label of "Delete" (a11y fix elsewhere in this
  // suite), which getByRole('button', { name: 'delete' }) would otherwise
  // also match.
  await page.locator('.btn-danger', { hasText: 'Delete' }).click()
  await expect(clientRow).not.toBeVisible()
})
