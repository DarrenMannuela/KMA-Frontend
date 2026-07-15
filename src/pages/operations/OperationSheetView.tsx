import { useMemo, useState } from 'react'
import { ArrowLeft, Wrench } from 'lucide-react'
import { operationHooks } from '@/hooks'
import { Spinner } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { OperationsSpreadsheet } from './OperationsSpreadsheet'
import { isInMonth } from '@/utils/MonthUtils'

interface OperationsSheetViewProps {
  onBack: () => void
}

export function OperationsSheetView({ onBack }: OperationsSheetViewProps) {
  const { data: allData = [], isLoading } = operationHooks.useList()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )

  if (isLoading) {
    return <Spinner />
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
          <Wrench className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">Operations Spreadsheet</h2>
        </div>
        <MonthNavigator year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </div>

      <OperationsSpreadsheet data={monthData} />
    </div>
  )
}