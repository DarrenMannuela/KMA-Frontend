import { useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp } from '@/components/ui'
import { itemHooks, orderHooks } from '@/hooks'
import type { Item, CreateItemRequest } from '@/types'

function ItemForm({ editing, onClose }: { editing: Item | null; onClose: () => void }) {
  const create = itemHooks.useCreate()
  const update = itemHooks.useUpdate()
  const { data: orders = [] } = orderHooks.useList()

  const [form, setForm] = useState<Omit<CreateItemRequest, 'sub_total'>>({
    order_id:  editing?.order_id  ?? '',
    item_name: editing?.item_name ?? '',
    size:      editing?.size      ?? '',
    amount:    editing?.amount    ?? 1,
    price:     editing?.price     ?? 0,
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: ['amount', 'price'].includes(k) ? Number(e.target.value) : e.target.value }))

  const subTotal = form.amount * form.price

  const handleSubmit = () => {
    const payload: CreateItemRequest = { ...form, size: form.size || null, sub_total: subTotal }
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
        <select className="field" value={form.order_id}
          onChange={e => setForm(p => ({ ...p, order_id: e.target.value }))}>
          <option value="">Select order…</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <input className="field" placeholder="e.g. Apron" value={form.item_name} onChange={set('item_name')} />
        </FormField>
        <FormField label="Size">
          <input className="field" placeholder="e.g. S, M, L, XL" value={form.size ?? ''} onChange={set('size')} />
        </FormField>
        <FormField label="Amount" required>
          <input className="field" type="number" min={1} value={form.amount} onChange={set('amount')} />
        </FormField>
        <FormField label="Unit Price (Rp)" required>
          <input className="field font-mono" type="number" min={0} value={form.price} onChange={set('price')} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-slate-500">Subtotal</span>
        <span className="font-mono font-semibold text-navy-900">{formatRp(subTotal)}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function ItemsPage() {
  const { data, isLoading } = itemHooks.useList()
  const del = itemHooks.useDelete()

  return (
    <CrudPage<Item>
      title="Order Items"
      icon={ListOrdered}
      data={data}
      isLoading={isLoading}
      searchKeys={['item_name']}
      columns={[
        { header: 'ID',        key: 'id' },
        { header: 'Order ID',  key: 'order_id' },
        { header: 'Item',      key: 'item_name', render: r => <span className="font-medium">{r.item_name}</span> },
        { header: 'Size',      key: 'size',      render: r => r.size ? <span className="badge-slate">{r.size}</span> : '—' },
        { header: 'Qty',       key: 'amount' },
        { header: 'Price',     key: 'price',     render: r => <span className="currency">{formatRp(r.price)}</span> },
        { header: 'Subtotal',  key: 'sub_total', render: r => <span className="currency font-semibold">{formatRp(r.sub_total)}</span> },
      ]}
      formTitle={e => e ? 'Edit Item' : 'Add Item'}
      renderForm={(editing, onClose) => <ItemForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete item "${r.item_name}"?`}
    />
  )
}
