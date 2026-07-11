import { useMemo, useState } from 'react'
import { Factory, Plus, ArrowRight } from 'lucide-react'
import { productionHooks, supplierHooks } from '@/hooks'
import { formatRp, FormField } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { SpendBars } from '@/components/ui/SpendBars'
import { isInMonth, todayISODate } from '@/utils/MonthUtils'
import { SI_UNITS } from '@/utils/Units'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import type { CreateProductionRowRequest } from '@/types'

interface ProductionDashboardProps {
  /** Undefined = "just open the sheet"; a number = "open the sheet pre-filtered to this supplier". */
  onOpenSheet: (supplierId?: number) => void
}

// Price/Qty are kept as raw strings while the form is open so a controlled
// input can actually go blank while typing — converting to Number on every
// keystroke means backspacing to "" instantly snaps back to 0 and the field
// looks stuck. Conversion happens once, at submit time.
const emptyQuickAdd = () => ({
  header_id: '', description: '', supplier_id: 0, material_name: '',
  price: '', si_unit: 'yard', amount: '1', date: todayISODate(),
})

export function ProductionDashboard({ onOpenSheet }: ProductionDashboardProps) {
  const { data: allData = [], isLoading } = productionHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()
  const create = productionHooks.useCreate()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAdd())

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )

  const supplierTotals = useMemo(() => {
    const totals: Record<number, number> = {}
    monthData.forEach(row => {
      totals[row.supplier_id] = (totals[row.supplier_id] ?? 0) + row.price * row.amount
    })
    return Object.entries(totals).map(([id, value]) => ({
      id: Number(id),
      label: suppliers.find(s => s.id === Number(id))?.supplier_name ?? 'Unassigned',
      value,
    }))
  }, [monthData, suppliers])

  const monthTotal = monthData.reduce((s, r) => s + r.price * r.amount, 0)

  const handleQuickAdd = () => {
    if (!quickAdd.header_id || !quickAdd.description) return
    const payload: CreateProductionRowRequest = {
      ...quickAdd,
      price: Number(quickAdd.price) || 0,
      amount: Number(quickAdd.amount) || 1,
    }
    create.mutate(payload, {
      onSuccess: () => {
        // Keep the Kas Bon identity (header_id/description/supplier/date) so
        // the next "Add Entry" click adds another material line to the same
        // Kas Bon — only the item-specific fields get cleared. Use "New Kas
        // Bon" to start a different header instead.
        setQuickAdd(p => ({ ...p, material_name: '', price: '', amount: '1' }))
      },
    })
  }

  const handleNewKasBon = () => setQuickAdd(emptyQuickAdd())

  if (isLoading) {
    return <div className="p-6 text-slate-400 text-sm">Loading production ledger…</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Factory className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">Production Costs</h2>
        </div>
        <MonthNavigator year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={() => setQuickAddOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800"
        >
          <Plus size={15} /> Quick add
        </button>
        <button
          onClick={() => onOpenSheet()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy-700"
        >
          Open full spreadsheet <ArrowRight size={15} />
        </button>
      </div>

      {quickAddOpen && (
        <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50">
          <div className="md:col-span-4 flex items-center justify-between -mb-1">
            <p className="text-xs text-slate-400">Same Kas Bon ID stays filled in so you can add another material line.</p>
            <button onClick={handleNewKasBon} className="text-xs text-navy-600 hover:underline shrink-0">
              New Kas Bon
            </button>
          </div>
          <FormField label="Kas Bon ID">
            <input className="field font-mono" placeholder="01/KB/26" value={quickAdd.header_id}
              onChange={e => setQuickAdd(p => ({ ...p, header_id: e.target.value }))} />
          </FormField>
          <div className="md:col-span-3">
            <FormField label="Description">
              <textarea className="field resize-none" rows={1} placeholder="e.g. Beli bahan Basic 902" value={quickAdd.description}
                onChange={e => setQuickAdd(p => ({ ...p, description: e.target.value }))} />
            </FormField>
          </div>

          <FormField label="Supplier">
            <select className="field" value={quickAdd.supplier_id}
              onChange={e => setQuickAdd(p => ({ ...p, supplier_id: Number(e.target.value) }))}>
              <option value={0}>Select…</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
            </select>
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Material">
              <input className="field" placeholder="e.g. Basic 902" value={quickAdd.material_name}
                onChange={e => setQuickAdd(p => ({ ...p, material_name: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Unit">
            <select className="field" value={quickAdd.si_unit}
              onChange={e => setQuickAdd(p => ({ ...p, si_unit: e.target.value }))}>
              {SI_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </FormField>

          <FormField label="Price / Unit">
            <input className="field font-mono" type="text" inputMode="numeric" placeholder="0" value={formatThousands(quickAdd.price)}
              onChange={e => setQuickAdd(p => ({ ...p, price: stripCommas(e.target.value) }))} />
          </FormField>
          <FormField label="Qty">
            <input className="field" type="text" inputMode="numeric" placeholder="1" value={quickAdd.amount}
              onChange={e => setQuickAdd(p => ({ ...p, amount: stripCommas(e.target.value) }))} />
          </FormField>
          <FormField label="Date">
            <input className="field" type="date" value={quickAdd.date}
              onChange={e => setQuickAdd(p => ({ ...p, date: e.target.value }))} />
          </FormField>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={create.isPending} onClick={handleQuickAdd}>
              {create.isPending ? 'Adding…' : 'Add Entry'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-5 bg-navy-900 border-navy-800">
        <div className="flex items-center justify-between mb-4">
          <span className="text-navy-300 text-sm font-medium">Spend by Supplier</span>
          <span className="font-mono font-bold text-white text-lg">{formatRp(monthTotal)}</span>
        </div>
        <div className="max-h-80 overflow-y-auto pr-1 -mr-1">
          <SpendBars
            items={supplierTotals}
            onSelect={(id) => onOpenSheet(id != null ? Number(id) : undefined)}
            emptyLabel="No production spend recorded for this month"
          />
        </div>
        {supplierTotals.length > 0 && (
          <p className="text-navy-400 text-xs mt-3">Click a supplier to open its entries in the spreadsheet.</p>
        )}
      </div>
    </div>
  )
}