import { useMemo, useState } from 'react'
import { Factory, Plus, ArrowRight, RotateCcw, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { productionHooks, supplierHooks, useFinanceHeaders } from '@/hooks'
import { useKasBonIdSuggestion } from '@/hooks/useKasBonIdSuggestion'
import { formatRp, FormField, Spinner, UppercaseField } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { SpendBars } from '@/components/ui/SpendBars'
import { isInMonth, todayISODate } from '@/utils/MonthUtils'
import { SI_UNITS } from '@/utils/Units'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/constants/supplierCategories'
import { ApiError } from '@/api'
import type { CreateProductionRowRequest } from '@/types'

interface ProductionDashboardProps {
  /** Undefined = "just open the sheet"; a number = "open the sheet pre-filtered to this supplier". */
  onOpenSheet: (supplierId?: number) => void
  /** Last supplier selected from the bars, if any — kept in the parent page
   *  so the highlight survives a round trip to the spreadsheet and back. */
  selectedSupplierId?: number
}

// Price/Qty are kept as raw strings while the form is open so a controlled
// input can actually go blank while typing — converting to Number on every
// keystroke means backspacing to "" instantly snaps back to 0 and the field
// looks stuck. Conversion happens once, at submit time.
const emptyQuickAdd = () => ({
  header_id: '', description: '', supplier_id: 0, material_name: '',
  price: '', si_unit: 'yard', amount: '1', date: todayISODate(),
})

export function ProductionDashboard({ onOpenSheet, selectedSupplierId }: ProductionDashboardProps) {
  const { data: allData = [], isLoading, isError, refetch } = productionHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()
  const { data: headers = [], refetch: refetchHeaders } = useFinanceHeaders()
  const create = productionHooks.useCreate()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAdd())
  // Tracks which required fields were empty on the last submit attempt, so
  // the fields themselves can flag red instead of the click just doing
  // nothing with no explanation.
  const [missing, setMissing] = useState<Set<'header_id' | 'description'>>(new Set())

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )

  // Same convention as OrdersPage's idTouched. Shared with
  // OperationsDashboard via useKasBonIdSuggestion. refetchHeaders is
  // passed so resetIdSuggestion (below, wired to the 409 handler) recomputes
  // off a fresh header list instead of this render's possibly-stale one —
  // same reasoning as OrdersPage/GenerateInvoiceForm's own resetIdSuggestion.
  const { idTouched, setIdTouched, reset: resetIdSuggestion } = useKasBonIdSuggestion(
    headers,
    quickAdd.header_id,
    header_id => setQuickAdd(p => ({ ...p, header_id })),
    refetchHeaders
  )

  const supplierTotals = useMemo(() => {
    const totals: Record<number, number> = {}
    monthData.forEach(row => {
      totals[row.supplier_id] = (totals[row.supplier_id] ?? 0) + row.price * row.amount
    })
    return Object.entries(totals).map(([id, value]) => {
      const supplier = suppliers.find(s => s.id === Number(id))
      return {
        id: Number(id),
        label: supplier?.supplier_name ?? 'Unassigned',
        category: supplier ? CATEGORY_LABELS[supplier.supplier_category] : undefined,
        color: supplier ? CATEGORY_COLORS[supplier.supplier_category] : undefined,
        value,
      }
    })
  }, [monthData, suppliers])

  const monthTotal = monthData.reduce((s, r) => s + r.price * r.amount, 0)

  // Live preview of Price × Qty so people can catch a fat-fingered price or
  // quantity before it's submitted, instead of only after it shows up in
  // the spreadsheet.
  const quickAddSubtotal = (Number(quickAdd.price) || 0) * (Number(quickAdd.amount) || 0)

  const handleQuickAdd = () => {
    const emptyFields = new Set<'header_id' | 'description'>()
    if (!quickAdd.header_id) emptyFields.add('header_id')
    if (!quickAdd.description) emptyFields.add('description')
    if (emptyFields.size > 0) {
      setMissing(emptyFields)
      toast.error('Kas Bon ID and Description are required')
      return
    }
    setMissing(new Set())
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
      // Same race OrdersPage/GenerateInvoiceForm guard against: the
      // suggested Kas Bon ID is a client-side guess, so two people quick-
      // adding at once can land on the same suggestion. The backend 409s
      // the second submit — resuggest a fresh number instead of leaving
      // the form stuck on one that's already taken.
      onError: (e: Error) => {
        if (e instanceof ApiError && e.status === 409) {
          toast.error('That Kas Bon ID was just taken by someone else — grabbing you a new one.')
          resetIdSuggestion()
        }
      },
    })
  }

  const handleNewKasBon = () => { setQuickAdd(emptyQuickAdd()); setMissing(new Set()); setIdTouched(false) }

  if (isLoading) {
    return <Spinner />
  }
  // Distinguish "the fetch actually failed" from "there's just no spend
  // recorded yet" — previously indistinguishable, since productionHooks.
  // useList() folded any query failure into the same empty `data` used
  // while still loading (see finance.ts's own fix for the underlying gap).
  if (isError) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
        <p className="text-red-400 mb-3">Couldn't load production data — check your connection and try again.</p>
        <button onClick={() => refetch()} className="btn-secondary">Retry</button>
      </div>
    )
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

          {/* Sticky reminder of which Kas Bon new lines are landing on — the
              caption above is easy to miss once you've scrolled or added a
              few lines in a row, this stays right next to the fields. */}
          {quickAdd.header_id && (
            <div className="md:col-span-4 -mb-1">
              <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1">
                Adding to <span className="font-mono font-semibold">{quickAdd.header_id}</span>
                {quickAdd.description && <span className="text-navy-400">— {quickAdd.description}</span>}
              </span>
            </div>
          )}

          <FormField label="Kas Bon ID" required>
            <div className="flex items-center gap-2">
              <UppercaseField
                className={`field font-mono ${missing.has('header_id') ? '!border-red-400 !ring-red-100' : ''}`}
                placeholder="01/KB/26"
                value={quickAdd.header_id}
                onChange={v => { setIdTouched(true); setQuickAdd(p => ({ ...p, header_id: v })) }}
              />
              <button
                type="button"
                className="btn-ghost btn-sm !px-2 shrink-0"
                title="Reset to suggested next number"
                onClick={resetIdSuggestion}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            {!idTouched && (
              <p className="text-xs text-slate-400 mt-1">
                Auto-suggested as next Kas Bon number for {new Date().getFullYear()} — edit if needed.
              </p>
            )}
          </FormField>
          <div className="md:col-span-3">
            <FormField label="Description" required>
              <UppercaseField
                as="textarea"
                className={`field resize-none ${missing.has('description') ? '!border-red-400 !ring-red-100' : ''}`}
                rows={1}
                placeholder="e.g. Beli bahan Basic 902"
                value={quickAdd.description}
                onChange={v => setQuickAdd(p => ({ ...p, description: v }))}
              />
            </FormField>
          </div>

          <FormField label="Supplier">
            <select className="field" value={quickAdd.supplier_id}
              onChange={e => setQuickAdd(p => ({ ...p, supplier_id: Number(e.target.value) }))}>
              <option value={0}>Select…</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.supplier_name} · {CATEGORY_LABELS[s.supplier_category]}
                </option>
              ))}
            </select>
          </FormField>
          <div className="md:col-span-3">
            <FormField label="Material">
              <UppercaseField className="field" placeholder="e.g. Basic 902" value={quickAdd.material_name}
                onChange={v => setQuickAdd(p => ({ ...p, material_name: v }))} />
            </FormField>
          </div>

          <FormField label="Qty">
            <input className="field" type="text" inputMode="decimal" placeholder="1" value={quickAdd.amount}
              onChange={e => setQuickAdd(p => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
          </FormField>
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
          <FormField label="Date">
            <input className="field" type="date" value={quickAdd.date}
              onChange={e => setQuickAdd(p => ({ ...p, date: e.target.value }))} />
          </FormField>

          {/* Live Price × Qty preview — lets people catch a fat-fingered
              number before it's submitted rather than after. */}
          <div className="md:col-span-4 flex items-center justify-between -mt-1">
            <span className="text-xs text-slate-400">
              {quickAddSubtotal > 0 && <>= <span className="font-mono font-semibold text-slate-600">{formatRp(quickAddSubtotal)}</span> for this line</>}
            </span>
          </div>

          <div className="flex items-end md:col-start-4">
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
            selectedId={selectedSupplierId ?? null}
            // Not id != null ? onOpenSheet(Number(id)) : onOpenSheet(undefined)
            // — SpendBars treats clicking an already-selected bar as a
            // "deselect" and calls onSelect(null), which used to fall
            // through to onOpenSheet(undefined) and navigate to the
            // spreadsheet with NO filter. That reads as the bar's
            // highlight just turning off; it actually jumped to a
            // different (unfiltered) screen. Every bar click here always
            // means "open this supplier's entries," so the null/deselect
            // case is simply ignored — clicking a highlighted bar again
            // just re-opens the same filtered view instead of surprising
            // you with the unfiltered one.
            onSelect={(id) => { if (id != null) onOpenSheet(Number(id)) }}
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