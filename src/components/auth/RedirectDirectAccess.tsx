import { useLocation, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

// Print pages are reached from inside the app. A cold load of one (typed URL,
// reopened tab, refresh) goes to the dashboard: react-router's location.key is
// 'default' only on the first route a page load renders. Nested inside
// ProtectedRoute so a logged-out hit still goes to /login. A refresh on a
// print page also redirects; exclude a route from this wrapper if that's
// ever unwanted.
export function RedirectDirectAccess({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (location.key === 'default') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}