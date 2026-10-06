import { useRef, useLayoutEffect } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

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
export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete' }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  // Defaults to a delete, but any one-way action can use it.
  confirmLabel?: string
}) {
  const isMobile = useIsMobile()

  // Bottom sheet on phones, buttons full width with Cancel first.
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end bg-navy-950/30 backdrop-blur-sm fade-in"
        onClick={e => e.target === e.currentTarget && onCancel()}
      >
        <div className="bg-white w-full rounded-t-3xl shadow-2xl slide-up">
          <div className="pt-2.5 pb-1 flex justify-center">
            <div className="w-9 h-1 rounded-full bg-slate-200" />
          </div>
          <div className="flex gap-3 px-5 pt-2 pb-5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700">{message}</p>
          </div>
          <div className="flex flex-col gap-2 px-5 pb-6">
            <button className="btn-secondary w-full" onClick={onCancel}>Cancel</button>
            <button className="btn-danger w-full" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    )
  }

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
          <button className="btn-danger btn-sm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
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
// An <input> (or as="textarea") that uppercases as you type, keeping the
// caret where it was. The app's convention for names, addresses and IDs.
//   <UppercaseField className="field" value={v} onChange={setV} />
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