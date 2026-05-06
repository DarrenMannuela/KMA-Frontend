import { useState } from 'react'
import { FileText } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp } from '@/components/ui'
import { recapHooks, orderHooks } from '@/hooks'
import type { OrderRecap, CreateOrderRecapRequest } from '@/types'

function RecapForm({ editing, onClose }: { editing: OrderRecap | null; onClose: () => void }) {
  const create = recapHooks.useCreate()
  const update = recapHooks.useUpdate()
  const { data: orders = [] } = orderHooks.useList()

  const [form, setForm] = useState<Omit<CreateOrderRecapRequest, 'remaining' | 'ar_receivable'>>({
    order_id:     editing?.order_id     ?? 0,
    total:        editing?.total        ?? 0,
    down_payment: editing?.down_payment ?? 0,
    discount:     editing?.discount     ?? 0,
    amount:       editing?.amount       ?? 0,
  })

  const remaining   = form.amount - (form.down_payment ?? 0)
  const ar = remaining - (form.discount ?? 0)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: Number(e.target.value) }))

  const handleSubmit = () => {
    const payload: CreateOrderRecapRequest = { ...form, remaining, ar_receivable: ar }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Order" required>
        <select className="field" value={form.order_id} onChange={e => setForm(p => ({ ...p, order_id: Number(e.target.value) }))}>
          <option value={0}>Select order…</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Total Items">
          <input className="field" type="number" min={0} value={form.total} onChange={set('total')} />
        </FormField>
        <FormField label="Amount (Rp)">
          <input className="field font-mono" type="number" min={0} value={form.amount} onChange={set('amount')} />
        </FormField>
        <FormField label="Down Payment (Rp)">
          <input className="field font-mono" type="number" min={0} value={form.down_payment ?? 0} onChange={set('down_payment')} />
        </FormField>
        <FormField label="Discount (Rp)">
          <input className="field font-mono" type="number" min={0} value={form.discount ?? 0} onChange={set('discount')} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Remaining</span><span className="font-mono">{formatRp(remaining)}</span></div>
        <div className="flex justify-between font-semibold"><span>AR Receivable</span><span className="font-mono text-red-600">{formatRp(ar)}</span></div>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Recap' : 'Create Recap'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function OrderRecapPage() {
  const { data, isLoading } = recapHooks.useList()
  const del = recapHooks.useDelete()

  return (
    <CrudPage<OrderRecap>
      title="Order Recap"
      icon={FileText}
      data={data}
      isLoading={isLoading}
      columns={[
        { header: 'Recap ID',    key: 'id',           render: r => <span className="id-chip">{r.id}</span> },
        { header: 'Order ID',    key: 'order_id' },
        { header: 'Items',       key: 'total' },
        { header: 'Amount',      key: 'amount',       render: r => <span className="currency">{formatRp(r.amount)}</span> },
        { header: 'Down Payment',key: 'down_payment', render: r => <span className="currency text-green-700">{formatRp(r.down_payment)}</span> },
        { header: 'Discount',    key: 'discount',     render: r => <span className="currency">{formatRp(r.discount)}</span> },
        { header: 'Remaining',   key: 'remaining',    render: r => <span className="currency text-amber-700">{formatRp(r.remaining)}</span> },
        { header: 'AR',          key: 'ar_receivable',render: r => <span className="currency font-semibold text-red-600">{formatRp(r.ar_receivable)}</span> },
      ]}
      formTitle={e => e ? 'Edit Recap' : 'New Order Recap'}
      renderForm={(editing, onClose) => <RecapForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete recap ${r.id}?`}
    />
  )
}
