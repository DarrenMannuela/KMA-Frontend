# E2E tests

Real Playwright tests against a live KMA deployment — not the throwaway
scratchpad scripts used earlier in development, these are committed and
meant to be re-run.

## Why these aren't in CI

They need a live KMA + KMA-Auth backend (separate repos), reachable at a
real URL, with a real test account. GitHub Actions' hosted runner has
none of that — wiring it up would mean checking out and standing up both
backend repos inside the CI job, which is a real undertaking of its own,
not a quick addition. `.github/workflows/ci.yml` runs lint/typecheck/build
only. Run this suite locally, or against the deployed app, by hand.

## Running

```bash
E2E_BASE_URL=https://kma.corvus-grouper.ts.net \
E2E_EMAIL=<test-account-email> \
E2E_PASSWORD=<test-account-password> \
npm run test:e2e
```

- `E2E_BASE_URL` defaults to `http://localhost:5173` (the Vite dev server)
  if not set — only useful if the backend's reachable from there too (see
  vite.config.ts's proxy; it points at `localhost:8000`, which isn't
  exposed by default — see the main KMA repo's docker-compose.yaml).
- `E2E_EMAIL` / `E2E_PASSWORD`: a **dedicated test account**, never a real
  user's credentials. One was created earlier this project for exactly
  this. Never commit these — pass them as env vars each run.
- `npm run test:e2e:ui` opens Playwright's UI mode (step through, inspect,
  re-run one test) instead of the plain CLI reporter.

## How auth works here

`global-setup.ts` logs in **once** for the whole run and saves the session
to `tests/e2e/.auth/state.json` (gitignored — it holds a real session
cookie). Every spec file loads it by default (`playwright.config.ts`'s
`use.storageState`) instead of logging in itself.

This isn't just an optimization: KMA-Auth rate-limits `/login` (added this
same project, for real security reasons), and a full suite doing a fresh
login per test reliably tripped it. `99-auth.spec.ts` — the one spec that
actually needs to test login/logout — opts back out with its own
`test.use({ storageState: { cookies: [], origins: [] } })` and does real,
individual logins. It's numbered to run **last**: logging in or out
there invalidates the shared session (the account only holds one
concurrent session, same as any real user), which would break every
later test relying on the shared one. If you add a new spec file that
also needs to log in for real, give it a number after `99-`, or expect
the same breakage.

`fixtures.ts`'s `gotoAuthed(page, path)` — use this instead of a bare
`page.goto(path)` for the first navigation in a test using the shared
session. The app's own tab-liveness check
(`src/utils/tabSession.ts`) treats "no sessionStorage marker from this
tab, and no other tab answers on the BroadcastChannel" as proof KMA was
fully closed and reopened, and proactively ends the leftover session —
correct, deliberate behavior for a real browser, but Playwright's
`storageState` only captures `localStorage`, never `sessionStorage`, so
every fresh test context looks exactly like a closed-and-reopened KMA to
that check. `gotoAuthed` seeds the same marker a real continued visit
would have before navigating, so the real session doesn't get logged out
from under the test.

## What's covered

- `01-order-to-cash.spec.ts` — creates a client, then an order linked to
  it, then deletes both. Intentionally stops there rather than chasing
  the whole pipeline (items, invoice, delivery, Bukti Kas) — a good next
  extension if this suite grows. Test data is timestamped
  (`E2E TEST CLIENT <id>` / `E2E-<id>`) and self-cleans at the end of the
  test; if a run crashes mid-test, the leftover rows are easy to spot and
  delete by hand (or via the API) by that same prefix.
- `02-accessibility.spec.ts` — axe-core WCAG 2 A/AA checks on Dashboard,
  Orders, Finance Overview and Clients.
- `99-auth.spec.ts` — login success/failure, and the dark-mode toggle
  round-trip. Runs last; see above.

Print pages (invoices, kwitansi, delivery notes, the finance report)
aren't covered — they're meant to render identically regardless of
in-app theme/session state and are lower-risk than the authenticated
app flows above.
