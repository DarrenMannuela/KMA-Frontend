import { useRef, useLayoutEffect } from 'react'
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

// ─── UppercaseField ────────────────────────────────────────────────────────
// Drop-in replacement for a plain <input>/<textarea> that force-uppercases
// as you type — the convention used all over this app (Item Name, Company,
// Address, Kas Bon ID, Supplier Name, etc.). Forcing .toUpperCase() on
// every keystroke re-renders the field with a new string each time, which
// resets the caret to the end unless something restores it — invisible
// while typing at the end of the field, but breaks the moment you click
// into the middle of existing text and type: the caret jumps to the end
// after every character. This restores the caret position after every
// change — same fix as EditableCell.tsx's inline-cell editor uses, just
// packaged as a real component so every page shares one fix instead of
// each hand-rolling its own onChange={e => setX(e.target.value.toUpperCase())}.
//
// Usage (input, the default):
//   <UppercaseField className="field" value={form.item_name}
//     onChange={v => setForm(p => ({ ...p, item_name: v }))} />
//
// Usage (textarea, e.g. Address/Notes/Description):
//   <UppercaseField as="textarea" rows={2} className="field resize-none"
//     value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} />
type UppercaseFieldElement = HTMLInputElement | HTMLTextAreaElement

type UppercaseInputProps = {
  value: string
  onChange: (value: string) => void
  as?: 'input'
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>

type UppercaseTextareaProps = {
  value: string
  onChange: (value: string) => void
  as: 'textarea'
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>

export function UppercaseField(props: UppercaseInputProps | UppercaseTextareaProps) {
  const { value, onChange, as = 'input', ...rest } = props
  const ref = useRef<UppercaseFieldElement>(null)
  const caretPos = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (caretPos.current != null && ref.current) {
      ref.current.setSelectionRange(caretPos.current, caretPos.current)
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<UppercaseFieldElement>) => {
    caretPos.current = e.target.selectionStart
    onChange(e.target.value.toUpperCase())
  }

  if (as === 'textarea') {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={handleChange}
        {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    )
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      value={value}
      onChange={handleChange}
      {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  )
}

// ─── Currency formatter ───────────────────────────────────────────────────────
export function formatRp(value: number | null | undefined) {
  if (value == null) return '—'
  return 'Rp ' + value.toLocaleString('id-ID')
}



export * from './EditableCell'
export * from './SpreadsheetView'