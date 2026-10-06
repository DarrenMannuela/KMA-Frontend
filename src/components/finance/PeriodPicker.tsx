import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '@/utils/MonthUtils'
import type { Period, PeriodMode } from './ledgerModel'

const MODES: { mode: PeriodMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'year', label: 'Year' },
  { mode: 'all', label: 'All' },
  { mode: 'range', label: 'Dates' },
]

export function periodLabel(p: Period): string {
  switch (p.mode) {
    case 'month': return monthLabel(p.year, p.month)
    case 'year': return String(p.year)
    case 'range': return `${p.from || '…'} – ${p.to || '…'}`
    default: return 'All time'
  }
}

/** A short file-name-safe name for the period: "2026-10", "2026", "all". */
export function periodSlug(p: Period): string {
  switch (p.mode) {
    case 'month': return `${p.year}-${String(p.month + 1).padStart(2, '0')}`
    case 'year': return String(p.year)
    case 'range': return `${p.from || 'start'}_${p.to || 'now'}`
    default: return 'all'
  }
}

export function currentPeriod(mode: PeriodMode = 'month'): Period {
  const now = new Date()
  return { mode, year: now.getFullYear(), month: now.getMonth(), from: '', to: '' }
}

export function PeriodPicker({ value, onChange, modes = ['month', 'year', 'all', 'range'] }: {
  value: Period
  onChange: (p: Period) => void
  modes?: PeriodMode[]
}) {
  const step = (delta: number) => {
    if (value.mode === 'month') {
      const d = new Date(value.year, value.month + delta, 1)
      onChange({ ...value, year: d.getFullYear(), month: d.getMonth() })
    } else if (value.mode === 'year') {
      onChange({ ...value, year: value.year + delta })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Period">
        {MODES.filter(m => modes.includes(m.mode)).map(m => (
          <button
            key={m.mode}
            role="tab"
            aria-selected={value.mode === m.mode}
            onClick={() => onChange({ ...value, mode: m.mode })}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${value.mode === m.mode ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {(value.mode === 'month' || value.mode === 'year') && (
        <div className="flex items-center">
          <button onClick={() => step(-1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[7.5rem] text-center tabular-nums">{periodLabel(value)}</span>
          <button onClick={() => step(1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {value.mode === 'range' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="field !py-1 !w-auto text-xs" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} aria-label="From" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" className="field !py-1 !w-auto text-xs" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} aria-label="To" />
        </div>
      )}
    </div>
  )
}
