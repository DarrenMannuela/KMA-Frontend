import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { authApi, AuthApiError } from '@/api/authApi'
import {AuthUser} from '@/types'

interface AuthContextValue {
  user: AuthUser | null
  // 'error' is distinct from 'unauthenticated': a clean 401 from /me means
  // the session really is invalid/expired, but a network drop, timeout, or
  // 5xx from the auth service means the session's validity was never
  // actually checked. Folding both into 'unauthenticated' used to bounce
  // every route guard to /login on a transient blip (flaky wifi on first
  // load) indistinguishably from a genuinely expired session — see
  // retryMe below and the route guards' own 'error' branches.
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error'
  login: (email: string, password: string) => Promise<void>
  acceptInvite: (token: string, newPassword: string) => Promise<void>
  logout: () => Promise<void>
  retryMe: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  // Bumped to re-run the effect below on demand (e.g. the route guards'
  // "Retry" button after a network-error status) without duplicating the
  // fetch-and-branch logic outside the effect.
  const [attempt, setAttempt] = useState(0)

  // On first load (and again on retryMe), ask the auth service whether
  // the browser already holds a valid session cookie (e.g. the page was
  // refreshed) rather than assuming a logged-out state.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) {
          setUser(user)
          setStatus('authenticated')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setUser(null)
        // A real 401 means "checked, and you're not logged in." Anything
        // else (no status at all, or a 5xx) means the check itself
        // failed — that's not the same thing and shouldn't send someone
        // to /login as if it were.
        setStatus(err instanceof AuthApiError && err.status === 401 ? 'unauthenticated' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retryMe = useCallback(() => setAttempt(a => a + 1), [])

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authApi.login(email, password)
    setUser(user)
    setStatus('authenticated')
  }, [])

  // Same shape as login — the backend hands back a real session on a
  // successful invite acceptance (see AcceptInvite's comment in
  // user_handler.go), so this applies to local state exactly the way a
  // normal login does, just via a different backend call.
  const acceptInvite = useCallback(async (token: string, newPassword: string) => {
    const { user } = await authApi.acceptInvite(token, newPassword)
    setUser(user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      // Clear local state even if the network call fails — the user
      // clicked logout and expects to land back at the login screen.
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, status, login, acceptInvite, logout, retryMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export { AuthApiError }