import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// While the session is still being checked, `user` is null without meaning
// logged out: wait, as ProtectedRoute does.
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