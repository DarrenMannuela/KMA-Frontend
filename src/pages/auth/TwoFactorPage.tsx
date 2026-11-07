import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, ArrowLeft, Check, Download, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi, AuthApiError } from '@/api/authApi'
import { useAuth } from '@/contexts/AuthContext'

// Groups a raw otpauth secret into 4-char chunks for the manual-entry
// fallback — same thing most authenticator apps show when scanning isn't
// an option (reading it off a phone, a camera-less machine, etc).
function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

type Step = 'status' | 'password' | 'scan' | 'recovery'

export function TwoFactorPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [step, setStep] = useState<Step>('status')
  const [currentPassword, setCurrentPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [savedConfirmed, setSavedConfirmed] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const enabled = user?.totp_enabled ?? false

  // ── Step 1: confirm the current password, start setup ──────────────
  async function handleStartSetup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { otpauth_url } = await authApi.setupTotp(currentPassword)
      const url = new URL(otpauth_url)
      setSecret(url.searchParams.get('secret') ?? '')
      setQrDataUrl(await QRCode.toDataURL(otpauth_url, { width: 240, margin: 1 }))
      setCurrentPassword('')
      setStep('scan')
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t('auth.twoFactor.couldNotStart'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 2: confirm a code from the authenticator app actually works ──
  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { recovery_codes } = await authApi.verifyTotp(code)
      setRecoveryCodes(recovery_codes)
      setCode('')
      setStep('recovery')
      // user.totp_enabled on the context updates next time /me is fetched
      // (e.g. navigating away and back) — fine, since this page shows its
      // own freshly-confirmed state regardless until then.
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t('auth.twoFactor.couldNotVerify'))
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDownloadCodes() {
    const blob = new Blob(
      [`${t('auth.twoFactor.downloadHeader', { date: new Date().toLocaleString() })}\n\n${recoveryCodes.join('\n')}\n`],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kma-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDisable(password: string) {
    try {
      await authApi.disableTotp(password)
      toast.success(t('auth.twoFactor.turnedOffToast'))
      setConfirmDisable(false)
      navigate(0) // refetch /me so user.totp_enabled reflects the change
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : t('auth.twoFactor.couldNotDisable'))
    }
  }

  // ── Recovery codes, shown exactly once ──────────────────────────────
  if (step === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10 dark:bg-navy-950">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4 dark:bg-navy-800 dark:ring-1 dark:ring-white/10">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">{t('auth.twoFactor.saveCodesTitle')}</h1>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
              {t('auth.twoFactor.saveCodesSubtitle')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 dark:bg-navy-900 dark:border-navy-800">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-navy-900 bg-slate-50 rounded-lg p-4 dark:text-slate-50 dark:bg-navy-950">
              {recoveryCodes.map(c => <span key={c}>{c}</span>)}
            </div>
            <button
              onClick={handleDownloadCodes}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-200 text-sm text-navy-700 hover:bg-slate-50 transition-colors dark:border-navy-700 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Download className="w-4 h-4" /> {t('auth.twoFactor.downloadAsText')}
            </button>

            <label className="flex items-start gap-2 mt-5 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={savedConfirmed} onChange={e => setSavedConfirmed(e.target.checked)} className="mt-0.5" />
              {t('auth.twoFactor.savedConfirm')}
            </label>

            <button
              disabled={!savedConfirmed}
              onClick={() => navigate('/')}
              className="btn-primary mt-4 w-full justify-center !py-2.5 font-semibold"
            >
              {t('auth.twoFactor.done')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Scan the QR, then verify a code from it ─────────────────────────
  if (step === 'scan') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10 dark:bg-navy-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4 dark:bg-navy-800 dark:ring-1 dark:ring-white/10">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">{t('auth.twoFactor.scanTitle')}</h1>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
              {t('auth.twoFactor.scanSubtitle')}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col items-center gap-4 dark:bg-navy-900 dark:border-navy-800">
            {qrDataUrl && <img src={qrDataUrl} alt={t('auth.twoFactor.qrAlt')} width={200} height={200} className="rounded-lg dark:bg-white dark:p-3" />}
            <p className="font-mono text-xs text-slate-500 tracking-wider text-center break-all dark:text-slate-400">{groupSecret(secret)}</p>

            <form onSubmit={handleVerify} className="w-full flex flex-col gap-3 mt-2">
              <div>
                <label htmlFor="verify-code" className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 dark:text-slate-400">
                  {t('auth.twoFactor.enterCodeItShows')}
                </label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900 text-center tracking-[0.3em] font-mono
                             focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center !py-2.5 font-semibold"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? t('auth.twoFactor.verifying') : t('auth.twoFactor.verifyAndTurnOn')}
              </button>
            </form>
          </div>

          <button
            onClick={() => { setStep('status'); setError(null) }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 dark:text-slate-500 dark:hover:text-slate-200 transition-colors mt-6 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> {t('auth.cancel')}
          </button>
        </div>
      </div>
    )
  }

  // ── Confirm the current password before starting setup ─────────────
  if (step === 'password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4 dark:bg-navy-800 dark:ring-1 dark:ring-white/10">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">{t('auth.twoFactor.confirmTitle')}</h1>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">{t('auth.twoFactor.confirmSubtitle')}</p>
          </div>

          <form onSubmit={handleStartSetup} className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4 dark:bg-navy-900 dark:border-navy-800">
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 dark:text-slate-400">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 dark:text-slate-500" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900
                             focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
                  placeholder="••••••••••••"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:text-navy-700 transition-colors dark:text-slate-400 dark:hover:text-slate-400" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary mt-2 w-full justify-center !py-2.5 font-semibold"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? t('auth.twoFactor.continuing') : t('auth.twoFactor.continue')}
            </button>
          </form>

          <button
            onClick={() => { setStep('status'); setCurrentPassword(''); setError(null) }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 dark:text-slate-500 dark:hover:text-slate-200 transition-colors mt-6 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> {t('auth.cancel')}
          </button>
        </div>
      </div>
    )
  }

  // ── Status: on/off, with the one action available from here ────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-navy-950">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 dark:text-slate-500 dark:hover:text-slate-200 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> {t('auth.back')}
        </button>

        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4 dark:bg-navy-800 dark:ring-1 dark:ring-white/10">
            <ShieldCheck className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-slate-50">{t('auth.twoFactor.title')}</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">{t('auth.twoFactor.subtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 dark:bg-navy-900 dark:border-navy-800">
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${enabled ? 'bg-green-50 dark:bg-green-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
            {enabled ? <Check className="w-5 h-5 text-green-600 shrink-0 dark:text-green-400" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 dark:text-amber-400" />}
            <p className={`text-sm font-medium ${enabled ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {enabled ? t('auth.twoFactor.statusOn') : t('auth.twoFactor.statusOff')}
            </p>
          </div>

          <button
            onClick={() => (enabled ? setConfirmDisable(true) : setStep('password'))}
            className={`w-full mt-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              enabled
                ? 'border border-red-200 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
                : 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950 dark:hover:bg-gold-400'
            }`}
          >
            {enabled ? t('auth.twoFactor.turnOffButton') : t('auth.twoFactor.turnOnButton')}
          </button>
        </div>
      </div>

      {confirmDisable && (
        <DisableConfirm onConfirm={handleDisable} onCancel={() => setConfirmDisable(false)} />
      )}
    </div>
  )
}

// A password-gated confirm, not the plain ConfirmDialog — disabling 2FA
// needs the same "prove it's really you" guard as turning it on (see
// authApi.disableTotp's own comment), not just a yes/no.
function DisableConfirm({ onConfirm, onCancel }: { onConfirm: (password: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await onConfirm(password)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onCancel()}>
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4 dark:bg-navy-900">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5 dark:text-red-400" />
          <p className="text-sm text-slate-700 dark:text-slate-300">{t('auth.twoFactor.disableWarning')}</p>
        </div>
        <input
          type="password"
          autoFocus
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t('auth.twoFactor.yourPassword')}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:bg-navy-900 dark:border-navy-700 dark:text-slate-50"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-white/5">{t('auth.cancel')}</button>
          <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
            {submitting ? t('auth.twoFactor.turningOff') : t('auth.twoFactor.turnOff')}
          </button>
        </div>
      </form>
    </div>
  )
}
