import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Mirrors ProtectedRoute's status handling: while AuthContext is still
// checking whether the session cookie is valid (status === 'loading'),
// `user` is null but that does NOT mean logged out — it means "don't
// know yet". Redirecting to /login on every null `user` (regardless of
// status) caused a page refresh or back-navigation to bounce straight to
// the login screen even for an already-valid session, because this
// component used to fire before the /me check had a chance to resolve.
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, status, retryMe } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-navy-200 border-t-navy-900 animate-spin" />
      </div>
    )
  }

  // Same distinction ProtectedRoute makes: a failed session check isn't
  // the same as a confirmed-invalid one, and shouldn't be treated like it.
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 text-center">
        <p className="text-sm text-slate-500 mb-3">Couldn't verify your session — check your connection and try again.</p>
        <button onClick={retryMe} className="btn-secondary btn-sm">Retry</button>
      </div>
    )
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />
  }
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}