import { useLocation, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

// Print pages (invoice print, kwitansi print, delivery print) are meant
// to be reached FROM somewhere else in the app — clicking "Print" on an
// order or an invoice-list row — not as a standalone destination someone
// lands on cold. Doing that (typing the URL, reopening a closed tab,
// hitting refresh on one of these pages) used to load the print page
// directly with nothing around it, which read as broken rather than as
// "you've reached a print view."
//
// `location.key` is react-router's own signal for exactly the
// distinction needed here: it's the literal string 'default' ONLY on the
// very first route this app instance renders — i.e. a full page load
// (typed URL, bookmark, refresh, or a reopened tab). Every subsequent
// client-side navigation (a <Link> click, a navigate() call, even
// browser back/forward through app history) gets its own fresh, unique
// key instead. So `key === 'default'` here means this specific render is
// the FIRST thing this browser tab ever showed, which is exactly the
// "typed the URL / reopened the tab" case this exists to catch — nothing
// reached via in-app navigation can ever produce that value.
//
// Deliberately nested INSIDE ProtectedRoute at each call site (see
// App.tsx) rather than checking auth here itself — an unauthenticated
// direct hit should still go through ProtectedRoute's own existing
// redirect to /login, not get reinterpreted as "go to the dashboard"
// before that check even runs.
//
// Trade-off worth knowing: this can't distinguish "typed a fresh URL"
// from "hit refresh while already on this page" — both are full page
// loads, so refreshing mid-print also bounces to the dashboard. If that
// turns out to be unwanted for a specific print flow, the fix is to
// exclude that one route from this wrapper, not to change this
// component's own logic.
export function RedirectDirectAccess({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (location.key === 'default') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}