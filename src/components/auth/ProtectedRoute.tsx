import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, retryMe } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-navy-200 border-t-navy-900 animate-spin" />
      </div>
    )
  }

  // Distinct from 'unauthenticated' — the session check itself failed
  // (network/5xx), not a confirmed "you're logged out." Bouncing this to
  // /login too would make a transient blip on first load indistinguishable
  // from an actually-expired session; offering a retry in place keeps
  // someone with a perfectly valid session from being kicked out by wifi.
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 text-center">
        <p className="text-sm text-slate-500 mb-3">Couldn't verify your session — check your connection and try again.</p>
        <button onClick={retryMe} className="btn-secondary btn-sm">Retry</button>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
