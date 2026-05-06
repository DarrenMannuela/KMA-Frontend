import { useState } from 'react'
import { Truck, PackageCheck, ScrollText } from 'lucide-react'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField } from '@/components/ui'
import { deliveryHooks, deliveryOrderHooks, suratJalanHooks } from '@/hooks'
import type {
  Delivery, CreateDeliveryRequest,
  DeliveryOrder, CreateDeliveryOrderRequest,
  SuratJalan,
} from '@/types'

// ─── Delivery ─────────────────────────────────────────────────────────────────

function DeliveryForm({ editing, onClose }: { editing: Delivery | null; onClose: () => void }) {
  const create = deliveryHooks.useCreate()
  const update = deliveryHooks.useUpdate()

  const [form, setForm] = useState<CreateDeliveryRequest>({
    address:        editing?.address        ?? '',
    po_number:      editing?.po_number      ?? '',
    phone_number:   editing?.phone_number   ?? '',
    contact_person: editing?.contact_person ?? '',
    date:           editing?.date ? editing.date.split('T')[0] : '',
  })

  const setStr = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = () => {
    const payload = { ...form, date: form.date ? new Date(form.date).toISOString() : new Date().toISOString() }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Delivery ID / Surat Jalan No.">
        <input className="field font-mono" placeholder="e.g. 01/KMA/SJ/26" readOnly={!!editing}
          value={(editing?.id ?? '')} onChange={() => {}} />
        {!editing && <p className="text-xs text-slate-400 mt-1">ID is set automatically by the server</p>}
      </FormField>
      <FormField label="Delivery Address" required>
        <input className="field" placeholder="e.g. Jl. Hayam Wuruk No. 1" value={form.address} onChange={setStr('address')} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="PO Number">
          <input className="field font-mono" placeholder="P0000011" value={form.po_number ?? ''} onChange={setStr('po_number')} />
        </FormField>
        <FormField label="Delivery Date">
          <input className="field" type="date" value={form.date} onChange={setStr('date')} />
        </FormField>
        <FormField label="Contact Person">
          <input className="field" placeholder="e.g. Ibu Tuti" value={form.contact_person ?? ''} onChange={setStr('contact_person')} />
        </FormField>
        <FormField label="Phone Number">
          <input className="field font-mono" placeholder="081219201007" value={form.phone_number ?? ''} onChange={setStr('phone_number')} />
        </FormField>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Delivery' : 'Create Delivery'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function DeliveryPage() {
  const { data, isLoading } = deliveryHooks.useList()
  const del = deliveryHooks.useDelete()

  return (
    <CrudPage<Delivery>
      title="Delivery"
      icon={Truck}
      data={data}
      isLoading={isLoading}
      searchKeys={['address', 'contact_person', 'po_number']}
      columns={[
        { header: 'Delivery ID',     key: 'id',             render: r => <span className="id-chip">{r.id}</span> },
        { header: 'Address',         key: 'address',        render: r => <span className="font-medium">{r.address}</span> },
        { header: 'Contact',         key: 'contact_person', render: r => r.contact_person ?? '—' },
        { header: 'Phone',           key: 'phone_number',   render: r => <span className="font-mono text-xs">{r.phone_number ?? '—'}</span> },
        { header: 'PO',              key: 'po_number',      render: r => <span className="font-mono text-xs">{r.po_number ?? '—'}</span> },
        { header: 'Date',            key: 'date',           render: r => r.date ? format(new Date(r.date), 'dd MMM yyyy') : '—' },
      ]}
      formTitle={e => e ? 'Edit Delivery' : 'New Delivery'}
      renderForm={(editing, onClose) => <DeliveryForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete delivery ${r.id}?`}
    />
  )
}

// ─── Delivery Orders ──────────────────────────────────────────────────────────

function DeliveryOrderForm({ editing, onClose }: { editing: DeliveryOrder | null; onClose: () => void }) {
  const create = deliveryOrderHooks.useCreate()
  const update = deliveryOrderHooks.useUpdate()
  const { data: deliveries = [] } = deliveryHooks.useList()

  const [form, setForm] = useState<CreateDeliveryOrderRequest>({
    delivery_id: editing?.delivery_id ?? '',
    item_name:   editing?.item_name   ?? '',
    size:        editing?.size        ?? '',
    amount:      editing?.amount      ?? 1,
  })

  const handleSubmit = () => {
    const payload = { ...form, size: form.size || null }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Delivery" required>
        <select className="field" value={form.delivery_id}
          onChange={e => setForm(p => ({ ...p, delivery_id: e.target.value }))}>
          <option value="">Select delivery…</option>
          {deliveries.map(d => <option key={d.id} value={d.id}>{d.id} — {d.address}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <input className="field" placeholder="e.g. Apron" value={form.item_name}
            onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} />
        </FormField>
        <FormField label="Size">
          <input className="field" placeholder="S / M / L / XL" value={form.size ?? ''}
            onChange={e => setForm(p => ({ ...p, size: e.target.value }))} />
        </FormField>
        <FormField label="Amount" required>
          <input className="field" type="number" min={1} value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
        </FormField>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update' : 'Add Item'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function DeliveryOrdersPage() {
  const { data, isLoading } = deliveryOrderHooks.useList()
  const del = deliveryOrderHooks.useDelete()

  return (
    <CrudPage<DeliveryOrder>
      title="Delivery Orders"
      icon={PackageCheck}
      data={data}
      isLoading={isLoading}
      searchKeys={['item_name']}
      columns={[
        { header: 'ID',          key: 'id' },
        { header: 'Delivery ID', key: 'delivery_id',  render: r => <span className="id-chip">{r.delivery_id}</span> },
        { header: 'Item',        key: 'item_name',    render: r => <span className="font-medium">{r.item_name}</span> },
        { header: 'Size',        key: 'size',         render: r => r.size ? <span className="badge-slate">{r.size}</span> : '—' },
        { header: 'Amount',      key: 'amount' },
      ]}
      formTitle={e => e ? 'Edit Delivery Order' : 'Add Delivery Order Item'}
      renderForm={(editing, onClose) => <DeliveryOrderForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete delivery order item "${r.item_name}"?`}
    />
  )
}

// ─── Surat Jalan ─────────────────────────────────────────────────────────────

export function SuratJalanPage() {
  const { data, isLoading } = suratJalanHooks.useList()
  const del = suratJalanHooks.useDelete()

  return (
    <CrudPage<SuratJalan>
      title="Surat Jalan"
      icon={ScrollText}
      data={data}
      isLoading={isLoading}
      columns={[
        { header: 'ID',          key: 'id' },
        { header: 'Delivery ID', key: 'delivery_id',    render: r => <span className="id-chip">{r.delivery_id}</span> },
        { header: 'Items',       key: 'delivery_items', render: r => r.delivery_items?.join(', ') ?? '—' },
        { header: 'Sizes',       key: 'size',           render: r => r.size?.filter(Boolean).join(', ') ?? '—' },
        { header: 'Amount',      key: 'amount' },
      ]}
      formTitle={e => e ? 'Edit Surat Jalan' : 'New Surat Jalan'}
      renderForm={(_editing, onClose) => (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Surat Jalan is typically generated from a Delivery record. Create a Delivery first, then link items via Delivery Orders.</p>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      )}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete Surat Jalan ${r.id}?`}
    />
  )
}
