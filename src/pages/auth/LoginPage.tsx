import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { AuthApiError } from '@/api/authApi'

export function LoginPage() {
  const { login, mfaLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The account is signed in somewhere else (the auth service allows one
  // session per account): offer to sign that one out instead of leaving
  // the person locked out until it expires.
  const [signedInElsewhere, setSignedInElsewhere] = useState(false)

  // Password succeeded, but the account has 2FA on — a second screen
  // asks for a code instead of the account ever actually signing in yet.
  const [awaitingMfa, setAwaitingMfa] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)

  const redirectTo = (location.state as { from?: Location })?.from?.pathname || '/'

  async function signIn(takeOver: boolean) {
    setError(null)
    setSignedInElsewhere(false)
    setSubmitting(true)
    try {
      const result = await login(email, password, takeOver)
      if (result.mfaRequired) {
        setAwaitingMfa(true)
        return
      }
      if (takeOver) toast.success('Signed in here. The other device was signed out.')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // The backend deliberately returns the same generic message for
      // "no such user", "wrong password", and "account locked" — we
      // just surface it as-is rather than trying to be more specific.
      const message = err instanceof AuthApiError ? err.message : 'Could not reach the auth server'
      setError(message)
      const elsewhere = err instanceof AuthApiError && err.status === 409
      setSignedInElsewhere(elsewhere)
      // 401 and 409 are explained right under the form; a toast would
      // just say it twice.
      if (!(err instanceof AuthApiError) || (err.status !== 401 && !elsewhere)) {
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    signIn(false)
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { recoveryCodeUsed, recoveryCodesRemaining } = await mfaLogin(
        useRecoveryCode ? undefined : mfaCode,
        useRecoveryCode ? mfaCode : undefined,
      )
      if (recoveryCodeUsed) {
        toast.success(
          recoveryCodesRemaining === 0
            ? 'Signed in with a recovery code. That was your last one — set up two-factor again soon.'
            : `Signed in with a recovery code. ${recoveryCodesRemaining} left.`,
          { duration: 6000 },
        )
      }
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : 'Could not reach the auth server'
      setError(message)
      setMfaCode('')
    } finally {
      setSubmitting(false)
    }
  }

  if (awaitingMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">Two-factor authentication</h1>
            <p className="text-sm text-slate-400 mt-1 dark:text-slate-500">
              {useRecoveryCode ? 'Enter one of your recovery codes' : 'Enter the 6-digit code from your authenticator app'}
            </p>
          </div>

          <form
            onSubmit={handleMfaSubmit}
            className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4 dark:bg-navy-900 dark:border-navy-800"
          >
            <div>
              <label htmlFor="mfa-code" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">
                {useRecoveryCode ? 'Recovery code' : 'Code'}
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                required
                value={mfaCode}
                onChange={e => setMfaCode(useRecoveryCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900 text-center tracking-[0.3em] font-mono
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder={useRecoveryCode ? 'XXXX-XXXX' : '000000'}
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400" role="alert">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                         hover:bg-navy-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setUseRecoveryCode(v => !v); setMfaCode(''); setError(null) }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              {useRecoveryCode ? 'Use your authenticator app instead' : "Lost your device? Use a recovery code"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setAwaitingMfa(false); setPassword(''); setMfaCode(''); setError(null) }}
            className="block w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 mt-6 transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">Sign in to KMA</h1>
          <p className="text-sm text-slate-400 mt-1 dark:text-slate-500">Enter your credentials to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4 dark:bg-navy-900 dark:border-navy-800"
        >
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 dark:text-navy-700" />
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 dark:text-navy-700" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors dark:text-navy-700 dark:hover:text-slate-400"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400" role="alert">{error}</p>
          )}

          {signedInElsewhere && (
            <button
              type="button"
              onClick={() => signIn(true)}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg border border-navy-200 text-navy-900 dark:text-slate-50 text-sm font-semibold
                         hover:bg-navy-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Sign out the other device and sign in here
            </button>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                       hover:bg-navy-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6 dark:text-slate-500">
          Access is provisioned by an administrator — contact yours if you don't have an account.
        </p>
      </div>
    </div>
  )
}
