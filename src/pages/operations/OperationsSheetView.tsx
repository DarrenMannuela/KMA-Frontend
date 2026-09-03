import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Wrench, AlertTriangle } from 'lucide-react'
import { operationHooks } from '@/hooks'
import { Spinner } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { OperationsSpreadsheet } from './OperationsSpreadsheet'
import { isInMonth } from '@/utils/MonthUtils'

interface OperationsSheetViewProps {
  onBack: () => void
  /** Pre-filter to this category when arriving from a bar click on the dashboard.
   *  Deliberately spans multiple Kas Bons — see the comment in OperationsDashboard
   *  on why Category, not Kas Bon ID, is the grouping/filtering dimension. */
  initialCategory?: string
}

export function OperationsSheetView({ onBack, initialCategory }: OperationsSheetViewProps) {
  const { data: allData = [], isLoading, isError, refetch } = operationHooks.useList()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(initialCategory)

  // If the dashboard sends us here again with a different category, pick that up.
  useEffect(() => { setCategoryFilter(initialCategory) }, [initialCategory])

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )
  const visibleData = categoryFilter
    ? monthData.filter(r => (r.category || 'Uncategorized') === categoryFilter)
    : monthData

  if (isLoading) {
    return <Spinner />
  }
  // Same distinction made throughout — a failed fetch previously showed
  // exactly the same spreadsheet a genuinely empty month would.
  if (isError) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
        <p className="text-red-400 mb-3">Couldn't load operations data — check your connection and try again.</p>
        <button onClick={() => refetch()} className="btn-secondary">Retry</button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
          <Wrench className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">
            Operations Spreadsheet
            {categoryFilter && (
              <span className="text-slate-400 font-normal"> — {categoryFilter}</span>
            )}
          </h2>
        </div>
        <MonthNavigator year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </div>

      {categoryFilter && (
        <button onClick={() => setCategoryFilter(undefined)} className="text-xs text-navy-600 hover:underline">
          clear category filter
        </button>
      )}

      <OperationsSpreadsheet data={visibleData} />
    </div>
  )
}