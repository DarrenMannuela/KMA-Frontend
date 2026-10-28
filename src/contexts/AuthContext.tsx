import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { authApi, AuthApiError } from '@/api/authApi'
import { endClosedSession, forgetTab, markTabSignedIn, visitIsStillOpen } from '@/utils/tabSession'
import { clearAllDrafts } from '@/hooks/useUnsavedChanges'
import {AuthUser} from '@/types'

interface AuthContextValue {
  user: AuthUser | null
  // 'error': the session couldn't be checked (network, 5xx), unlike
  // 'unauthenticated' (a real 401). Route guards offer Retry instead of /login.
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error'
  // Resolves { mfaRequired: true } without signing in, for an account
  // with 2FA on — the caller (LoginPage) then collects a code and calls
  // mfaLogin to finish. Otherwise resolves { mfaRequired: false } having
  // already signed in, same as before 2FA existed.
  login: (email: string, password: string, takeOver?: boolean) => Promise<{ mfaRequired: boolean }>
  // The second step of signing in to an account with 2FA on. Pass
  // exactly one of code or recoveryCode.
  mfaLogin: (code?: string, recoveryCode?: string) => Promise<{ recoveryCodeUsed?: boolean; recoveryCodesRemaining?: number }>
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

  // On load (and retryMe), ask whether the browser still holds a valid session,
  // unless KMA was closed since: then the leftover session is ended (see
  // utils/tabSession.ts).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    visitIsStillOpen()
      .then(async (stillOpen) => {
        if (stillOpen) return authApi.me()
        await endClosedSession()
        throw new AuthApiError('KMA was closed: sign in again', 401)
      })
      .then(({ user }) => {
        if (!cancelled) {
          setUser(user)
          setStatus('authenticated')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setUser(null)
        // Only a 401 means logged out; anything else means the check failed.
        setStatus(err instanceof AuthApiError && err.status === 401 ? 'unauthenticated' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retryMe = useCallback(() => setAttempt(a => a + 1), [])

  const login = useCallback(async (email: string, password: string, takeOver = false) => {
    const result = await authApi.login(email, password, takeOver)
    if ('mfa_required' in result) {
      return { mfaRequired: true }
    }
    markTabSignedIn()
    setUser(result.user)
    setStatus('authenticated')
    return { mfaRequired: false }
  }, [])

  const mfaLogin = useCallback(async (code?: string, recoveryCode?: string) => {
    const result = await authApi.mfaLogin(code, recoveryCode)
    markTabSignedIn()
    setUser(result.user)
    setStatus('authenticated')
    return { recoveryCodeUsed: result.recovery_code_used, recoveryCodesRemaining: result.recovery_codes_remaining }
  }, [])

  // Accepting an invite signs the user in, like login.
  const acceptInvite = useCallback(async (token: string, newPassword: string) => {
    const { user } = await authApi.acceptInvite(token, newPassword)
    markTabSignedIn()
    setUser(user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      // Clear local state even if the network call fails — the user
      // clicked logout and expects to land back at the login screen.
      forgetTab()
      clearAllDrafts()
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, status, login, mfaLogin, acceptInvite, logout, retryMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
