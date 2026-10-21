import AxeBuilder from '@axe-core/playwright'
import { test, expect, gotoAuthed } from './fixtures'

// WCAG 2 A/AA only — not best-practice/experimental rules, which are
// opinionated enough to generate noise unrelated to real accessibility bugs.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const PAGES: { name: string; path: string }[] = [
  { name: 'Dashboard', path: '/' },
  { name: 'Orders list', path: '/orders' },
  { name: 'Finance Overview', path: '/finance' },
  { name: 'Clients list', path: '/clients' },
]

for (const { name, path } of PAGES) {
  test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
    await gotoAuthed(page, path)
    await page.waitForTimeout(800) // let data-dependent content (charts, tables) settle
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    const summary = results.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)
    expect(summary, summary.join('\n')).toEqual([])
  })
}
