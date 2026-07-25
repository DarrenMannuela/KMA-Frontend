import { useEffect, useMemo, useState } from 'react'
import { Wrench, Plus, ArrowRight, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { operationHooks, useFinanceHeaders } from '@/hooks'
import { formatRp, FormField, Spinner } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { SpendBars } from '@/components/ui/SpendBars'
import { isInMonth, todayISODate } from '@/utils/MonthUtils'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import type { CreateOperationRowRequest } from '@/types'

interface OperationsDashboardProps {
  /** Undefined = "just open the sheet"; a category = "open the sheet pre-filtered to that category". */
  onOpenSheet: (category?: string) => void
  /** Last category selected from the bars, if any — kept in the parent page
   *  so the highlight survives a round trip to the spreadsheet and back. */
  selectedCategory?: string
}

// Kas Bon IDs follow "NN/KB/YY" (e.g. "01/KB/26") — same convention as
// ProductionDashboard's suggestNextKasBonId (and suggestNextOrderId /
// suggestNextDeliveryId elsewhere). Takes the raw FinanceHeader list, not
// operationHooks' flattened rows, so the suggestion accounts for every Kas
// Bon in use — including ones with only Production items on them so far —
// see the comment on useFinanceHeaders in hooks/index.ts.
function suggestNextKasBonId(headers: { id: string }[]): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KB\\/${yy}$`)
  const usedNumbers = headers
    .map(h => h.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(2, '0')}/KB/${yy}`
}

// price kept as a raw string while typing — see comment in ProductionDashboard
// for why converting to Number on every keystroke breaks backspacing to blank.
// Category is the shared, sticky field for a Kas Bon (e.g. "Transport",
// "Utilities") — stays filled across "Add Entry" clicks, and is what the
// spreadsheet groups by and the bars below break spend down by.
// Description is the specific cost line (e.g. "Ojek to supplier") — cleared
// after each add, same role Material plays in Production's quick add.
const emptyQuickAdd = () => ({ header_id: '', category: '', item: '', price: '', date: todayISODate() })

export function OperationsDashboard({ onOpenSheet, selectedCategory }: OperationsDashboardProps) {
  const { data: allData = [], isLoading } = operationHooks.useList()
  const { data: headers = [] } = useFinanceHeaders()
  const create = operationHooks.useCreate()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAdd())
  // Only auto-fill/auto-refresh the Kas Bon ID while the user hasn't typed
  // their own value into that field — same convention as
  // ProductionDashboard/OrdersPage's idTouched.
  const [idTouched, setIdTouched] = useState(false)
  // Which required fields were empty on the last submit attempt — flags
  // the fields themselves instead of the click silently doing nothing.
  const [missing, setMissing] = useState<Set<'header_id' | 'category'>>(new Set())

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )
  const monthTotal = monthData.reduce((s, o) => s + o.price, 0)

  // Fill in the suggested next Kas Bon ID whenever the field is empty and
  // the user hasn't typed their own — see the matching effect in
  // ProductionDashboard.tsx for the full rationale.
  useEffect(() => {
    if (!idTouched && !quickAdd.header_id) {
      setQuickAdd(p => ({ ...p, header_id: suggestNextKasBonId(headers) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, quickAdd.header_id, idTouched])

  const resetIdSuggestion = () => {
    setIdTouched(false)
    setQuickAdd(p => ({ ...p, header_id: suggestNextKasBonId(headers) }))
  }

  // Spend grouped by Category — the closest Operations analog to
  // Production's "spend by supplier" bars. Kas Bon ID is just an arbitrary
  // reference number and isn't a meaningful category to group or filter
  // by; Category (e.g. "Transport", "Utilities") actually is, and a single
  // category naturally spans many different Kas Bons.
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    monthData.forEach(row => {
      const key = row.category || 'Uncategorized'
      totals[key] = (totals[key] ?? 0) + row.price
    })
    return Object.entries(totals).map(([category, value]) => ({
      id: category,
      label: category,
      value,
    }))
  }, [monthData])

  const handleQuickAdd = () => {
    const emptyFields = new Set<'header_id' | 'category'>()
    if (!quickAdd.header_id) emptyFields.add('header_id')
    if (!quickAdd.category) emptyFields.add('category')
    if (emptyFields.size > 0) {
      setMissing(emptyFields)
      toast.error('Kas Bon ID and Category are required')
      return
    }
    setMissing(new Set())
    const payload: CreateOperationRowRequest = {
      header_id: quickAdd.header_id,
      date: quickAdd.date,
      // Header-level receipt memo — only meaningful the first time this
      // Kas Bon is created; reuses Category as a sensible default label.
      description: quickAdd.category,
      // Item-level — this is what the spreadsheet/bars actually group by,
      // and can differ per line even under the same Kas Bon.
      category: quickAdd.category,
      item_description: quickAdd.item || quickAdd.category,
      price: Number(quickAdd.price) || 0,
    }
    create.mutate(payload, {
      onSuccess: () => {
        // Keep header_id/category/date filled so the next "Add Entry"
        // click adds another cost line to the same Kas Bon under the same
        // category — only the line-specific fields get cleared. Use "New
        // Kas Bon" to start a different header instead.
        setQuickAdd(p => ({ ...p, item: '', price: '' }))
      },
    })
  }

  const handleNewKasBon = () => { setQuickAdd(emptyQuickAdd()); setMissing(new Set()); setIdTouched(false) }

  if (isLoading) {
    return <Spinner />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">Operations Costs</h2>
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
        <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50">
          <div className="col-span-2 md:col-span-4 flex items-center justify-between -mb-1">
            <p className="text-xs text-slate-400">Same Kas Bon ID stays filled in so you can add another cost line.</p>
            <button onClick={handleNewKasBon} className="text-xs text-navy-600 hover:underline shrink-0">
              New Kas Bon
            </button>
          </div>

          {/* Sticky reminder of which Kas Bon new lines are landing on. */}
          {quickAdd.header_id && (
            <div className="col-span-2 md:col-span-4 -mb-1">
              <span className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1">
                Adding to <span className="font-mono font-semibold">{quickAdd.header_id}</span>
                {quickAdd.category && <span className="text-navy-400">— {quickAdd.category}</span>}
              </span>
            </div>
          )}

          <FormField label="Kas Bon ID" required>
            <div className="flex items-center gap-2">
              <input
                className={`field font-mono ${missing.has('header_id') ? '!border-red-400 !ring-red-100' : ''}`}
                placeholder="01/KB/26"
                value={quickAdd.header_id}
                onChange={e => { setIdTouched(true); setQuickAdd(p => ({ ...p, header_id: e.target.value.toUpperCase() })) }}
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
          <FormField label="Category" required>
            <input
              className={`field ${missing.has('category') ? '!border-red-400 !ring-red-100' : ''}`}
              placeholder="e.g. Transport, Utilities…"
              value={quickAdd.category}
              onChange={e => setQuickAdd(p => ({ ...p, category: e.target.value.toUpperCase() }))}
            />
          </FormField>
          <FormField label="Description">
            <input
              className="field"
              placeholder="e.g. Ojek to supplier"
              value={quickAdd.item}
              onChange={e => setQuickAdd(p => ({ ...p, item: e.target.value.toUpperCase() }))}
            />
          </FormField>
          <FormField label="Amount (Rp)">
            <input className="field font-mono" type="text" inputMode="numeric" placeholder="0" value={formatThousands(quickAdd.price)}
              onChange={e => setQuickAdd(p => ({ ...p, price: stripCommas(e.target.value) }))} />
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
          <span className="text-navy-300 text-sm font-medium">Spend by Category</span>
          <span className="font-mono font-bold text-white text-lg">{formatRp(monthTotal)}</span>
        </div>
        <div className="max-h-80 overflow-y-auto pr-1 -mr-1">
          <SpendBars
            items={categoryTotals}
            selectedId={selectedCategory ?? null}
            onSelect={(id) => onOpenSheet(id != null ? String(id) : undefined)}
            emptyLabel="No operations spend recorded for this month"
          />
        </div>
        {categoryTotals.length > 0 && (
          <p className="text-navy-400 text-xs mt-3">Click a category to open its entries in the spreadsheet.</p>
        )}
      </div>
    </div>
  )
}