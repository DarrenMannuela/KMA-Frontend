import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatRp } from '@/components/ui'
import { SI_UNITS } from '@/utils/Units'
import { todayISODate } from '@/utils/MonthUtils'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import type { FinanceBatch, FinanceHeader, Order, Supplier } from '@/types'
import { editBatch, supplierWithCategory, type EditField, type LedgerRow } from './ledgerModel'

/** Moves lines to another Kas Bon, or to a new one. */
export function MoveDialog({ rows, headers, onApply, onClose }: {
  rows: LedgerRow[]
  headers: FinanceHeader[]
  onApply: (batch: FinanceBatch, label: string) => void
  onClose: () => void
}) {
  const [id, setId] = useState('')
  const [date, setDate] = useState(rows[0]?.date.slice(0, 10) || todayISODate())
  const [description, setDescription] = useState(rows[0]?.description ?? '')
  const target = headers.find(h => h.id === id.trim())
  const apply = () => {
    const headerId = id.trim().toUpperCase()
    if (!headerId) return
    const batch = editBatch(rows, 'header_id', headerId)
    if (!target) batch.new_headers = [{ id: headerId, date, description: description.toUpperCase() }]
    onApply(batch, `Moved ${rows.length} line${rows.length === 1 ? '' : 's'} to ${headerId}`)
  }
  return (
    <Modal title={`Move ${rows.length} line${rows.length === 1 ? '' : 's'}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <label className="block">
          <span className="field-label">To Kas Bon</span>
          <input autoFocus className="field font-mono" list="move-kasbon" value={id} placeholder={suggestNextKasBonId(headers)}
            onChange={e => setId(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && apply()} />
          <datalist id="move-kasbon">{headers.slice(-300).reverse().map(h => <option key={h.id} value={h.id}>{h.description}</option>)}</datalist>
        </label>
        {id.trim() && !target && (
          <div className="rounded-lg bg-amber-50 p-3 space-y-2">
            <p className="text-xs text-amber-700">{id.trim()} is new: it will be created.</p>
            <input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} />
            <input className="field" placeholder="Description" value={description} onChange={e => setDescription(e.target.value.toUpperCase())} />
          </div>
        )}
        <button className="text-xs text-navy-600 hover:underline" onClick={() => setId(suggestNextKasBonId(headers))}>
          Use the next new number
        </button>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={apply} disabled={!id.trim()}>Move</button>
        </div>
      </div>
    </Modal>
  )
}

/** Sets one field on many lines: supplier, category or order. */
export function SetFieldDialog({ rows, field, suppliers, orders, categories, onApply, onClose }: {
  rows: LedgerRow[]
  field: 'supplier_id' | 'category' | 'order_id'
  suppliers: Supplier[]
  orders: Order[]
  categories: string[]
  onApply: (batch: FinanceBatch, label: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const what = { supplier_id: 'supplier', category: 'category', order_id: 'order' }[field]
  const apply = () => {
    const v = value.trim().toUpperCase()
    if (field === 'supplier_id') {
      if (!value) return setError('Pick a supplier')
      return onApply(editBatch(rows, field, Number(value)), `Set the supplier of ${rows.length} lines`)
    }
    if (field === 'order_id') {
      if (v && !orders.some(o => o.id === v)) return setError(`There's no order ${v}`)
      return onApply(editBatch(rows, field, v || null), v ? `Linked ${rows.length} lines to ${v}` : `Unlinked ${rows.length} lines`)
    }
    if (!v) return setError('Type a category')
    onApply(editBatch(rows, field, v), `Set the category of ${rows.length} lines to ${v}`)
  }
  return (
    <Modal title={`Set the ${what} of ${rows.length} line${rows.length === 1 ? '' : 's'}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        {field === 'supplier_id' ? (
          <select autoFocus className="field" value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Supplier…</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
          </select>
        ) : (
          <>
            <input autoFocus className="field font-mono" list="set-field-options" value={value}
              placeholder={field === 'order_id' ? 'Order ID, empty to unlink' : 'e.g. TRANSPORT'}
              onChange={e => { setValue(e.target.value.toUpperCase()); setError('') }} onKeyDown={e => e.key === 'Enter' && apply()} />
            <datalist id="set-field-options">
              {field === 'order_id'
                ? orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)
                : categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </Modal>
  )
}

/** Edits every field of one line (the phone layout's way to edit). */
export function LineEditor({ row, suppliers, orders, categories, onApply, onDelete, onClose }: {
  row: LedgerRow
  suppliers: Supplier[]
  orders: Order[]
  categories: string[]
  onApply: (batch: FinanceBatch, label: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [v, setV] = useState({
    date: row.date.slice(0, 10), description: row.description, name: row.name, supplier_id: row.supplier_id,
    category: row.category, qty: String(row.qty), unit: row.unit, price: String(row.price), order_id: row.order_id ?? '',
  })
  const [error, setError] = useState('')
  const prod = row.kind === 'production'
  const set = (patch: Partial<typeof v>) => { setV(x => ({ ...x, ...patch })); setError('') }

  const save = () => {
    const order = v.order_id.trim().toUpperCase()
    if (order && !orders.some(o => o.id === order)) return setError(`There's no order ${order}`)
    const changes: [EditField, unknown][] = []
    const add = (f: EditField, now: unknown, was: unknown) => { if (now !== was) changes.push([f, now]) }
    add('name', v.name.trim().toUpperCase(), row.name)
    add('price', Math.round(Number(v.price) || 0), row.price)
    add('order_id', order || null, row.order_id)
    if (prod) {
      add('supplier_id', v.supplier_id, row.supplier_id)
      add('qty', Number(v.qty.replace(',', '.')) || 0, row.qty)
      add('unit', v.unit, row.unit)
    } else {
      add('category', v.category.trim().toUpperCase(), row.category)
    }
    const batch: FinanceBatch = { production_update: [], operation_update: [] }
    for (const [f, value] of changes) {
      const b = editBatch([row], f, value)
      const fields = Object.assign({}, ...[...(b.production_update ?? []), ...(b.operation_update ?? [])].map(p => p.fields))
      const list = prod ? batch.production_update! : batch.operation_update!
      if (list.length) Object.assign(list[0].fields, fields)
      else list.push({ id: row.id, fields })
    }
    if (v.date !== row.date.slice(0, 10) || v.description !== row.description) {
      batch.header_update = [{ id: row.header_id, date: v.date, description: v.description.toUpperCase() }]
    }
    if (!changes.length && !batch.header_update) return onClose()
    onApply(batch, `Changed ${row.name || row.category}`)
  }

  const total = prod ? Math.round((Number(v.price) || 0) * (Number(v.qty.replace(',', '.')) || 0)) : Number(v.price) || 0
  return (
    <Modal title={`${row.header_id} · ${prod ? 'bahan' : 'cost'}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">Kas Bon date</span><input type="date" className="field" value={v.date} onChange={e => set({ date: e.target.value })} /></label>
          <label><span className="field-label">Kas Bon description</span><input className="field" value={v.description} onChange={e => set({ description: e.target.value.toUpperCase() })} /></label>
        </div>
        {prod ? (
          <>
            <label className="block"><span className="field-label">Bahan</span><input className="field" value={v.name} onChange={e => set({ name: e.target.value.toUpperCase() })} /></label>
            <label className="block"><span className="field-label">Supplier</span>
              <select className="field" value={v.supplier_id || ''} onChange={e => set({ supplier_id: Number(e.target.value) })}>
                <option value="">Supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label><span className="field-label">Qty</span><input className="field" inputMode="decimal" value={v.qty} onChange={e => set({ qty: e.target.value.replace(/[^\d.,]/g, '') })} /></label>
              <label><span className="field-label">Unit</span>
                <select className="field" value={v.unit} onChange={e => set({ unit: e.target.value })}>
                  {[...new Set([...SI_UNITS, v.unit])].map(u => <option key={u}>{u}</option>)}
                </select>
              </label>
              <label><span className="field-label">Price</span><input className="field" inputMode="numeric" value={v.price} onChange={e => set({ price: e.target.value.replace(/\D/g, '') })} /></label>
            </div>
          </>
        ) : (
          <>
            <label className="block"><span className="field-label">Category</span>
              <input className="field" list="line-categories" value={v.category} onChange={e => set({ category: e.target.value.toUpperCase() })} />
              <datalist id="line-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="block"><span className="field-label">Item</span><input className="field" value={v.name} onChange={e => set({ name: e.target.value.toUpperCase() })} /></label>
            <label className="block"><span className="field-label">Price</span><input className="field" inputMode="numeric" value={v.price} onChange={e => set({ price: e.target.value.replace(/\D/g, '') })} /></label>
          </>
        )}
        <label className="block"><span className="field-label">Order (optional)</span>
          <input className="field font-mono" list="line-orders" value={v.order_id} onChange={e => set({ order_id: e.target.value.toUpperCase() })} />
          <datalist id="line-orders">{orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)}</datalist>
        </label>
        <p className="text-sm text-slate-500">Total <span className="font-mono font-semibold text-navy-900">{formatRp(total)}</span></p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button className="btn-ghost text-red-600" onClick={onDelete}><Trash2 size={14} /> Delete</button>
          <span className="flex-1" />
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  )
}
