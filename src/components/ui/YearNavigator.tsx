import { ChevronLeft, ChevronRight } from 'lucide-react'

interface YearNavigatorProps {
  year: number
  onChange: (year: number) => void
}

// Same shape as MonthNavigator, one level up — used by the Yearly Report
// page instead of the month-by-month pages' MonthNavigator.
export function YearNavigator({ year, onChange }: YearNavigatorProps) {
  const isCurrentYear = new Date().getFullYear() === year

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(year - 1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Previous year">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-slate-700 w-16 text-center">{year}</span>
      <button onClick={() => onChange(year + 1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Next year">
        <ChevronRight size={16} />
      </button>
      {!isCurrentYear && (
        <button onClick={() => onChange(new Date().getFullYear())} className="text-xs text-navy-600 hover:underline ml-1">
          This Year
        </button>
      )}
    </div>
  )
}