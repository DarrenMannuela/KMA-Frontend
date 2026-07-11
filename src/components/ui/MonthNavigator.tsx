import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '@/utils/MonthUtils'

interface MonthNavigatorProps {
  year: number
  month: number // 0-11
  onChange: (year: number, month: number) => void
}

export function MonthNavigator({ year, month, onChange }: MonthNavigatorProps) {
  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    onChange(d.getFullYear(), d.getMonth())
  }

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => go(-1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-slate-700 w-36 text-center">{monthLabel(year, month)}</span>
      <button onClick={() => go(1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Next month">
        <ChevronRight size={16} />
      </button>
      {!isCurrentMonth && (
        <button
          onClick={() => onChange(now.getFullYear(), now.getMonth())}
          className="text-xs text-navy-600 hover:underline ml-1"
        >
          Today
        </button>
      )}
    </div>
  )
}