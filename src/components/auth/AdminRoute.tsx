import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Assumes useAuth() exposes `user` with a `role` field ('admin' | 'staff'),
// matching what the Go backend's publicUser() returns. If AuthContext
// hasn't loaded the session yet, adjust this to check whatever loading
// flag it exposes instead of falling straight to the role check.
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}