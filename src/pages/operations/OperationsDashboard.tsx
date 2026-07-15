import { useMemo, useState } from 'react'
import { Wrench, Plus, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { operationHooks } from '@/hooks'
import { formatRp, FormField, Spinner } from '@/components/ui'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { isInMonth, todayISODate } from '@/utils/MonthUtils'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import type { CreateOperationRowRequest } from '@/types'

interface OperationsDashboardProps {
  onOpenSheet: () => void
}

// price kept as a raw string while typing — see comment in ProductionDashboard
// for why converting to Number on every keystroke breaks backspacing to blank.
// Quick-add only exposes one description field, which is used for both the
// header (Kas Bon) description and the single item line created under it.
const emptyQuickAdd = () => ({ header_id: '', description: '', price: '', date: todayISODate() })

export function OperationsDashboard({ onOpenSheet }: OperationsDashboardProps) {
  const { data: allData = [], isLoading } = operationHooks.useList()
  const create = operationHooks.useCreate()

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(emptyQuickAdd())
  // Which required fields were empty on the last submit attempt — flags
  // the fields themselves instead of the click silently doing nothing.
  const [missing, setMissing] = useState<Set<'header_id' | 'description'>>(new Set())

  const monthData = useMemo(
    () => allData.filter(row => isInMonth(row.date, cursor.year, cursor.month)),
    [allData, cursor]
  )
  const monthTotal = monthData.reduce((s, o) => s + o.price, 0)

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
    const payload: CreateOperationRowRequest = {
      header_id: quickAdd.header_id,
      date: quickAdd.date,
      description: quickAdd.description,
      item_description: quickAdd.description,
      price: Number(quickAdd.price) || 0,
    }
    create.mutate(payload, {
      onSuccess: () => {
        // Keep header_id/date filled so the next "Add Entry" click adds
        // another cost line to the same Kas Bon. Description doubles as the
        // per-line description here, so it's cleared to avoid duplicating
        // the same line by accident — type a new one for the next cost.
        setQuickAdd(p => ({ ...p, description: '', price: '' }))
      },
    })
  }

  const handleNewKasBon = () => { setQuickAdd(emptyQuickAdd()); setMissing(new Set()) }

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

      <div className="card px-5 py-4 bg-navy-900 border-navy-800 flex items-center justify-between">
        <span className="text-navy-300 text-sm font-medium">Total this month</span>
        <span className="font-mono font-bold text-white text-lg">{formatRp(monthTotal)}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={() => setQuickAddOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800"
        >
          <Plus size={15} /> Quick add
        </button>
        <button
          onClick={onOpenSheet}
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
              </span>
            </div>
          )}

          <FormField label="Kas Bon ID" required>
            <input
              className={`field font-mono ${missing.has('header_id') ? '!border-red-400 !ring-red-100' : ''}`}
              placeholder="01/KB/26"
              value={quickAdd.header_id}
              onChange={e => setQuickAdd(p => ({ ...p, header_id: e.target.value }))}
            />
          </FormField>
          <FormField label="Description" required>
            <input
              className={`field ${missing.has('description') ? '!border-red-400 !ring-red-100' : ''}`}
              value={quickAdd.description}
              onChange={e => setQuickAdd(p => ({ ...p, description: e.target.value }))}
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
    </div>
  )
}