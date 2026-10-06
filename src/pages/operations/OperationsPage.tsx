import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams, periodParam, sheetParams } from '@/components/finance/ledgerParams'
import { OperationsDashboard } from './OperationsDashboard'

/** The operations dashboard, or (?view=sheet) every operation cost line. */
export function OperationsPage() {
  const [params, setParams] = useSearchParams()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  if (params.get('view') === 'sheet') {
    return (
      <Ledger
        key={params.toString()}
        kind="operation"
        title="Operations"
        icon={<Wrench className="text-navy-600" size={20} />}
        initial={filtersFromParams(params)}
        onBack={() => setParams({})}
      />
    )
  }
  return (
    <OperationsDashboard
      onOpenSheet={category => setParams(sheetParams({ group: category ?? '', period: periodParam({ mode: 'month', ...cursor }) }))}
      selectedCategory={undefined}
      cursor={cursor}
      onCursorChange={(year, month) => setCursor({ year, month })}
    />
  )
}
