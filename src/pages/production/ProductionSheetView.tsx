import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Factory } from 'lucide-react'
import { productionHooks, supplierHooks } from '@/hooks'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { ProductionSpreadsheet } from './ProductionsSpreadsheet'
import { isInMonth } from '@/utils/MonthUtils'

interface ProductionSheetViewProps {
  onBack: () => void
  /** Pre-filter to this supplier when arriving from a bar click on the dashboard. */
  initialSupplierId?: number
}

export function ProductionSheetView({ onBack, initialSupplierId }: ProductionSheetViewProps) {
  const { data: allData = [], isLoading } = productionHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [supplierFilter, setSupplierFilter] = useState<number | undefined>(initialSupplierId)

  // If the dashboard sends us here again with a different supplier, pick that up.
  useEffect(() => { setSupplierFilter(initialSupplierId) }, [initialSupplierId])

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )
  const visibleData = supplierFilter ? monthData.filter(r => r.supplier_id === supplierFilter) : monthData
  const supplierName = suppliers.find(s => s.id === supplierFilter)?.supplier_name

  if (isLoading) {
    return <div className="p-6 text-slate-400 text-sm">Loading production ledger…</div>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
          <Factory className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">
            Production Spreadsheet
            {supplierName && <span className="text-slate-400 font-normal"> — {supplierName}</span>}
          </h2>
        </div>
        <MonthNavigator year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </div>

      {supplierFilter && (
        <button onClick={() => setSupplierFilter(undefined)} className="text-xs text-navy-600 hover:underline">
          clear supplier filter
        </button>
      )}

      <ProductionSpreadsheet
        data={visibleData}
        defaultSupplierId={supplierFilter}
        groupBySupplier={!supplierFilter}
      />
    </div>
  )
}