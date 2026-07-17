import { useState, useEffect } from 'react'
import { ShoppingBag, Eye, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField } from '@/components/ui'
import { orderHooks } from '@/hooks'
import type { Order, CreateOrderRequest } from '@/types'
import { useNavigate } from 'react-router-dom'

// ─── ID auto-numbering ────────────────────────────────────────────────────
// Order IDs follow "NNN/KMA/YY" (e.g. "015/KMA/26"). For a brand new order
// we suggest the next sequential number for the CURRENT year, so switching
// years naturally restarts the count at 001 instead of continuing to climb.
function suggestNextOrderId(orders: Order[]): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KMA\\/${yy}$`)
  const usedNumbers = orders
    .map(o => o.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(3, '0')}/KMA/${yy}`
}

function OrderForm({ editing, onClose }: { editing: Order | null; onClose: () => void }) {
  const create = orderHooks.useCreate()
  const update = orderHooks.useUpdate()
  const navigate = useNavigate()
  const { data: orders = [] } = orderHooks.useList()

  // Only auto-fill/auto-refresh the ID while the user hasn't typed their
  // own value into that field — once they touch it, we back off completely
  // so we never clobber a manually-entered ID (e.g. a corrected number).
  const [idTouched, setIdTouched] = useState(false)

  const [form, setForm] = useState<CreateOrderRequest>({
    id :       editing?.id ?? '',
    company:   editing?.company   ?? '',
    po_number: editing?.po_number ?? '',
    // Default new orders to today — almost always correct, and still
    // fully editable if the order was actually placed on another date.
    date:      editing?.date ? editing.date.split('T')[0] : new Date().toISOString().split('T')[0],
  })

  // As soon as the orders list is available, prefill the ID suggestion for
  // brand-new orders. Runs once orders load, and again if the user hasn't
  // touched the field yet (covers the case where the form opens before
  // the list has finished fetching).
  useEffect(() => {
    if (!editing && !idTouched) {
      setForm(p => ({ ...p, id: suggestNextOrderId(orders) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, editing])

  // ID and PO Number are alphanumeric codes (e.g. "001/KMA/26", "P0000011")
  // — force them to uppercase as-typed so we never end up with "p0000011"
  // and "P0000011" being treated as different POs.
  const UPPERCASE_FIELDS: (keyof CreateOrderRequest)[] = ['id', 'po_number', 'company']

  const set = (k: keyof CreateOrderRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (k === 'id') setIdTouched(true)
    const raw = e.target.value
    const value = UPPERCASE_FIELDS.includes(k) ? raw.toUpperCase() : raw
    setForm(prev => ({ ...prev, [k]: value }))
  }

  const resetIdSuggestion = () => {
    setIdTouched(false)
    setForm(p => ({ ...p, id: suggestNextOrderId(orders) }))
  }

  const idAlreadyExists = orders.some(o => o.id === form.id && o.id !== editing?.id)
  const idChanged = !!editing && form.id !== editing.id

  const handleSubmit = () => {
    if (!form.id.trim()) return
    if (!form.company?.trim()) return
    if (idAlreadyExists) return

    const payload = {
      ...form,
      id: form.id.trim(),
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
    }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, {
        onSuccess: (newOrder) => {
          onClose()
          navigate(`/orders/${encodeURIComponent(newOrder.id)}`)
        }
      })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="ID" required>
        <div className="flex items-center gap-2">
          <input
            className="field font-mono"
            placeholder="001/KMA/26"
            value={form.id ?? ''}
            onChange={set('id')}
          />
          {!editing && (
            <button
              type="button"
              className="btn-ghost btn-sm !px-2 shrink-0"
              title="Reset to suggested next number"
              onClick={resetIdSuggestion}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        {idAlreadyExists ? (
          <p className="text-xs text-red-500 mt-1">
            An order with this ID already exists — pick a different number.
          </p>
        ) : idChanged ? (
          <p className="text-xs text-amber-600 mt-1">
            Renaming from {editing!.id} — linked items and invoices will move to the new ID automatically.
          </p>
        ) : !editing ? (
          <p className="text-xs text-slate-400 mt-1">
            Auto-suggested as next order number for {new Date().getFullYear()} — edit if needed.
          </p>
        ) : null}
      </FormField>
      <FormField label="Company" required>
        <input className="field" placeholder="e.g. Zenbu Restaurant" value={form.company ?? ''} onChange={set('company')} />
      </FormField>
      <FormField label="PO Number">
        <input className="field font-mono" placeholder="e.g. P0000011" value={form.po_number ?? ''} onChange={set('po_number')} />
      </FormField>
      <FormField label="Order Date" required>
        <input className="field" type="date" value={form.date} onChange={set('date')} />
      </FormField>
      <div className="flex gap-2 pt-2">
        <button
          className="btn-primary"
          disabled={busy || idAlreadyExists || !form.id.trim() || !form.company?.trim()}
          onClick={handleSubmit}
        >
          {busy ? 'Saving…' : editing ? 'Update Order' : 'Create Order'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const { data, isLoading } = orderHooks.useList()
  const del = orderHooks.useDelete()
  const navigate = useNavigate()

  return (
    <CrudPage<Order>
      title="Orders"
      icon={ShoppingBag}
      data={data}
      isLoading={isLoading}
      searchKeys={['company', 'po_number']}
      columns={[
        { header: 'Order ID',  key: 'id',         render: r => <span className="id-chip">{r.id}</span> },
        { header: 'Company',   key: 'company',     render: r => <span className="font-medium text-navy-900">{r.company ?? '—'}</span> },
        { header: 'PO Number', key: 'po_number',   render: r => <span className="font-mono text-xs">{r.po_number ?? '—'}</span> },
        { header: 'Date',      key: 'date',        render: r => r.date ? format(new Date(r.date), 'dd MMM yyyy') : '—' },
      ]}
      formTitle={e => e ? 'Edit Order' : 'New Order'}
      renderForm={(editing, onClose) => <OrderForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete order ${r.id}?`}
      rowActions={row => (
        <button
          className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
          onClick={() => navigate(`/orders/${encodeURIComponent(row.id)}`)}
          title="View items"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
    />
  )
}