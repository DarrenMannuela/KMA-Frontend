import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Factory } from 'lucide-react'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams, periodParam, sheetParams } from '@/components/finance/ledgerParams'
import { ProductionDashboard } from './ProductionDashboard'

/** The production dashboard, or (?view=sheet) every production line. */
export function ProductionPage() {
  const [params, setParams] = useSearchParams()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  if (params.get('view') === 'sheet') {
    return (
      <Ledger
        key={params.toString()}
        kind="production"
        title="Production"
        icon={<Factory className="text-navy-600" size={20} />}
        initial={filtersFromParams(params)}
        onBack={() => setParams({})}
      />
    )
  }
  return (
    <ProductionDashboard
      onOpenSheet={supplierId => setParams(sheetParams({ group: supplierId != null ? String(supplierId) : '', period: periodParam({ mode: 'month', ...cursor }) }))}
      selectedSupplierId={undefined}
      cursor={cursor}
      onCursorChange={(year, month) => setCursor({ year, month })}
    />
  )
}
