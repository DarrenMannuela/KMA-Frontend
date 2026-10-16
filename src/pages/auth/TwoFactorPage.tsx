import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, ArrowLeft, Check, Download, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
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
      setError(err instanceof AuthApiError ? err.message : 'Could not start setup')
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
      setError(err instanceof AuthApiError ? err.message : 'Could not verify the code')
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDownloadCodes() {
    const blob = new Blob(
      [`KMA two-factor recovery codes\nGenerated ${new Date().toLocaleString()}\nEach code works once.\n\n${recoveryCodes.join('\n')}\n`],
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
      toast.success('Two-factor authentication turned off')
      setConfirmDisable(false)
      navigate(0) // refetch /me so user.totp_enabled reflects the change
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : 'Could not disable two-factor authentication')
    }
  }

  // ── Recovery codes, shown exactly once ──────────────────────────────
  if (step === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900">Save your recovery codes</h1>
            <p className="text-sm text-slate-400 mt-1">
              Two-factor authentication is on. Each code works once, if you ever lose access to your authenticator app — they won't be shown again.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-navy-900 bg-slate-50 rounded-lg p-4">
              {recoveryCodes.map(c => <span key={c}>{c}</span>)}
            </div>
            <button
              onClick={handleDownloadCodes}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-200 text-sm text-navy-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Download as a text file
            </button>

            <label className="flex items-start gap-2 mt-5 text-sm text-slate-600">
              <input type="checkbox" checked={savedConfirmed} onChange={e => setSavedConfirmed(e.target.checked)} className="mt-0.5" />
              I've saved these codes somewhere safe
            </label>

            <button
              disabled={!savedConfirmed}
              onClick={() => navigate('/')}
              className="mt-4 w-full py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                         hover:bg-navy-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Scan the QR, then verify a code from it ─────────────────────────
  if (step === 'scan') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900">Scan this code</h1>
            <p className="text-sm text-slate-400 mt-1">
              Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and scan this, or enter the code by hand.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col items-center gap-4">
            {qrDataUrl && <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" width={200} height={200} className="rounded-lg" />}
            <p className="font-mono text-xs text-slate-500 tracking-wider text-center break-all">{groupSecret(secret)}</p>

            <form onSubmit={handleVerify} className="w-full flex flex-col gap-3 mt-2">
              <div>
                <label htmlFor="verify-code" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                  Enter the 6-digit code it shows
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
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-navy-900 text-center tracking-[0.3em] font-mono
                             focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                           hover:bg-navy-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Verifying…' : 'Verify and turn on'}
              </button>
            </form>
          </div>

          <button
            onClick={() => { setStep('status'); setError(null) }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 transition-colors mt-6 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Confirm the current password before starting setup ─────────────
  if (step === 'password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-5 h-5 text-gold-400" />
            </div>
            <h1 className="text-xl font-bold text-navy-900">Confirm it's you</h1>
            <p className="text-sm text-slate-400 mt-1">Enter your password to start setting up two-factor authentication.</p>
          </div>

          <form onSubmit={handleStartSetup} className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 flex flex-col gap-4">
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 text-sm text-navy-900
                             focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 transition-colors"
                  placeholder="••••••••••••"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold
                         hover:bg-navy-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Continuing…' : 'Continue'}
            </button>
          </form>

          <button
            onClick={() => { setStep('status'); setCurrentPassword(''); setError(null) }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 transition-colors mt-6 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Status: on/off, with the one action available from here ────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-navy-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-5 h-5 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900">Two-factor authentication</h1>
          <p className="text-sm text-slate-400 mt-1">An extra code from your phone, on top of your password, when you sign in.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6">
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${enabled ? 'bg-green-50' : 'bg-amber-50'}`}>
            {enabled ? <Check className="w-5 h-5 text-green-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
            <p className={`text-sm font-medium ${enabled ? 'text-green-700' : 'text-amber-700'}`}>
              {enabled ? "You're protected — two-factor authentication is on." : 'Two-factor authentication is off.'}
            </p>
          </div>

          <button
            onClick={() => (enabled ? setConfirmDisable(true) : setStep('password'))}
            className={`w-full mt-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              enabled
                ? 'border border-red-200 text-red-600 hover:bg-red-50'
                : 'bg-navy-900 text-white hover:bg-navy-800'
            }`}
          >
            {enabled ? 'Turn off two-factor authentication' : 'Turn on two-factor authentication'}
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
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">Turning this off means signing in again only needs your password. Enter it to confirm.</p>
        </div>
        <input
          type="password"
          autoFocus
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Your password"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
            {submitting ? 'Turning off…' : 'Turn off'}
          </button>
        </div>
      </form>
    </div>
  )
}
