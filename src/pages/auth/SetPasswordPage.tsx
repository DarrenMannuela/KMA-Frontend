import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { AuthApiError } from '@/api/authApi'
import { useAuth } from '@/contexts/AuthContext'

// Where an invite link lands ("…/set-password?token=…"). Public: there's no
// session yet.
export function SetPasswordPage() {
  const navigate = useNavigate()
  const { acceptInvite } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!token) return
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    setSubmitting(true)
    try {
      await acceptInvite(token, newPassword)
      toast.success('Password set — welcome to KMA')
      // acceptInvite already applied the new session to AuthContext
      // (see its comment) — this is a real logged-in landing, not
      // another trip through /login.
      navigate('/', { replace: true })
    } catch (err) {
      // The backend doesn't say whether the link expired, was used or is invalid.
      const message = err instanceof AuthApiError ? err.message : 'Could not set password'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  // Opened without a token, not from the emailed link.
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">Invalid link</h1>
          <p className="text-sm text-slate-400 mt-1 dark:text-slate-500">
            This page needs an invite link to work — check the email your administrator sent you, or ask them to send a new one.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 text-sm font-semibold text-navy-700 hover:text-navy-900 transition-colors dark:text-slate-200 dark:hover:text-slate-50"
          >
            Go to sign in
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
            <KeyRound className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">Set your password</h1>
          <p className="text-sm text-slate-400 mt-1 dark:text-slate-500">
            Choose a password for your KMA account. You'll be signed in automatically.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4 dark:bg-navy-900 dark:border-navy-800"
        >
          <div>
            <label htmlFor="new" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">
              New password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 dark:text-navy-700" />
              <input
                id="new"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors dark:text-navy-700 dark:hover:text-slate-400"
                tabIndex={-1}
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">
              Confirm password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 dark:text-navy-700" />
              <input
                id="confirm"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                       hover:bg-navy-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Setting password…' : 'Set password & sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}