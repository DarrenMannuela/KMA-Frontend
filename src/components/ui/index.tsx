import { Loader2, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Loader2 className="w-6 h-6 text-navy-400 animate-spin" />
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, subtitle }: {
  icon: LucideIcon
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-300">
      <Icon className="w-12 h-12 mb-3 opacity-40" />
      <p className="font-medium text-slate-500 text-sm">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/50 backdrop-blur-sm fade-in"
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm fade-up">
        <div className="flex gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn-danger btn-sm" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, accent = false }: {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <div className={`card p-5 fade-up ${accent ? 'bg-navy-900 border-navy-800' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <p className={`text-xs font-medium uppercase tracking-wider ${accent ? 'text-navy-300' : 'text-slate-400'}`}>
          {label}
        </p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-navy-800' : 'bg-slate-100'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-gold-400' : 'text-slate-500'}`} />
        </div>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${accent ? 'text-white' : 'text-navy-900'}`}>
        {value}
      </p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-navy-400' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}

// ─── FormField wrapper ────────────────────────────────────────────────────────
export function FormField({ label, children, required }: {
  label: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label className="field-label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Currency formatter ───────────────────────────────────────────────────────
export function formatRp(value: number | null | undefined) {
  if (value == null) return '—'
  return 'Rp ' + value.toLocaleString('id-ID')
}



export * from './EditableCell'
export * from './SpreadsheetView'