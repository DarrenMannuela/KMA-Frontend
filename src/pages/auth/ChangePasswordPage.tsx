import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Lock, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi, AuthApiError } from '@/api/authApi'
import { useAuth } from '@/contexts/AuthContext'

// Changing the password ends every session, this one included: go to /login
// afterwards.
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  // Forced (a temporary password) or chosen from the menu; only the latter can
  // be cancelled.
  const isForced = user?.must_change_password ?? false

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError(t('auth.changePassword.mismatch'))
      return
    }

    setSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      toast.success(t('auth.changePassword.successToast'))
      navigate('/login', { replace: true })
    } catch (err) {
      const message = err instanceof AuthApiError ? err.message : t('auth.changePassword.couldNotChange')
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
      <div className="w-full max-w-sm">
        {!isForced && (
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-700 transition-colors mb-6 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('auth.back')}
          </button>
        )}

        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4 dark:bg-navy-800 dark:ring-1 dark:ring-white/10">
            <KeyRound className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">
            {isForced ? t('auth.changePassword.forcedTitle') : t('auth.changePassword.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
            {isForced
              ? t('auth.changePassword.forcedSubtitle')
              : t('auth.changePassword.subtitle')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4 dark:bg-navy-900 dark:border-navy-800"
        >
          <div>
            <label htmlFor="current" className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 dark:text-slate-400">
              {isForced ? t('auth.changePassword.temporaryPassword') : t('auth.changePassword.currentPassword')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 dark:text-slate-500" />
              <input
                id="current"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                           focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                placeholder={isForced ? t('auth.changePassword.temporaryPlaceholder') : t('auth.changePassword.currentPlaceholder')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="new" className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 dark:text-slate-400">
              {t('auth.newPassword')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 dark:text-slate-500" />
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
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:text-navy-700 transition-colors dark:text-slate-400 dark:hover:text-slate-400"
                tabIndex={-1}
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 dark:text-slate-400">
              {t('auth.changePassword.confirmNewPassword')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 dark:text-slate-500" />
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
            className="btn-primary mt-2 w-full justify-center !py-2.5 font-semibold"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? t('auth.changePassword.updating') : t('auth.changePassword.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}