import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Sits inside ProtectedRoute (so `user` is guaranteed non-null here) and
// redirects to /change-password whenever the session's account still has
// an admin-set password. /change-password itself must NOT be wrapped in
// this route — same infinite-redirect trap ProtectedRoute avoids for
// /login.
export function MustChangePasswordRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}