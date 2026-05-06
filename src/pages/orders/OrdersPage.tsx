import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField } from '@/components/ui'
import { orderHooks } from '@/hooks'
import type { Order, CreateOrderRequest } from '@/types'

function OrderForm({ editing, onClose }: { editing: Order | null; onClose: () => void }) {
  const create = orderHooks.useCreate()
  const update = orderHooks.useUpdate()

  const [form, setForm] = useState<CreateOrderRequest>({
    company:   editing?.company   ?? '',
    po_number: editing?.po_number ?? '',
    date:      editing?.date ? editing.date.split('T')[0] : '',
  })

  const set = (k: keyof CreateOrderRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = () => {
    const payload = {
      ...form,
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
    }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
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
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
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
    />
  )
}
