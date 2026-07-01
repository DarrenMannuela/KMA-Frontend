import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, PackageCheck, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField } from '@/components/ui'
import { deliveryHooks, deliveryItemHooks} from '@/hooks'
import type {
  Delivery, CreateDeliveryRequest,
  DeliveryItem, CreateDeliveryItemRequest
} from '@/types'

// ─── Delivery ─────────────────────────────────────────────────────────────────

function DeliveryForm({ editing, onClose }: { editing: Delivery | null; onClose: () => void }) {
  const create = deliveryHooks.useCreate()
  const update = deliveryHooks.useUpdate()
  const navigate = useNavigate() 

  const [type, setType] = useState<'DO' | 'SJ'>(
    editing?.id?.includes('/SJ/') ? 'SJ' : 'DO'
  )

  const [form, setForm] = useState<CreateDeliveryRequest>({
    id:             editing?.id             ?? '', 
    type:           editing?.type           ?? type,
    address:        editing?.address        ?? '',
    po_number:      editing?.po_number      ?? '',
    phone_number:   editing?.phone_number   ?? '',
    contact_person: editing?.contact_person ?? '',
    date:           editing?.date ? editing.date.split('T')[0] : '',
  })

  const setStr = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const idPlaceholder = type === 'DO' ? '01/KMA/DO/26' : '01/KMA/SJ/26'

  const handleSubmit = () => {
      const payload = {
        ...form,
        date: form.date ? new Date(form.date).toISOString() : new Date().toISOString()
      }
      if (editing) {
        update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
      } else {
        create.mutate(payload, {
          onSuccess: (newDelivery) => {   // ← change this
            onClose()
            navigate(`/delivery/${encodeURIComponent(newDelivery.id)}`)
          }
        })
      }
    }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      {/* Type selector */}
      {!editing && (
        <FormField label="Delivery Type" required>
          <select className="field" value={type} onChange={e => {const t = e.target.value as 'DO' | 'SJ' 
          setType(t)
          setForm(p => ({ ...p, type: t }))
        }}

>
            <option value="DO">DO — Delivery Order (item delivery, per box)</option>
            <option value="SJ">SJ — Surat Jalan (documents: mock ups, invoices, receipts)</option>
          </select>
        </FormField>
      )}

      <FormField label={type === 'DO' ? 'Delivery Order No.' : 'Surat Jalan No.'}>
        <input
          className="field font-mono"
          placeholder={`e.g. ${idPlaceholder}`}
          readOnly={!!editing}
          value={form.id}
          onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
        />
        {!editing && (
          <p className="text-xs text-slate-400 mt-1">
            ID format: <span className="font-mono">{idPlaceholder}</span> — set manually or by server
          </p>
        )}
      </FormField>

      <FormField label="Delivery Address" required>
        <input className="field" placeholder="e.g. Jl. Hayam Wuruk No. 1"
          value={form.address} onChange={setStr('address')} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="PO Number">
          <input className="field font-mono" placeholder="P0000011"
            value={form.po_number ?? ''} onChange={setStr('po_number')} />
        </FormField>
        <FormField label="Delivery Date">
          <input className="field" type="date"
            value={form.date} onChange={setStr('date')} />
        </FormField>
        <FormField label="Contact Person">
          <input className="field" placeholder="e.g. Ibu Tuti"
            value={form.contact_person ?? ''} onChange={setStr('contact_person')} />
        </FormField>
        <FormField label="Phone Number">
          <input className="field font-mono" placeholder="081219201007"
            value={form.phone_number ?? ''} onChange={setStr('phone_number')} />
        </FormField>
      </div>

      {/* Context note based on type */}
      <div className={`rounded-lg px-4 py-3 text-xs ${
        type === 'DO'
          ? 'bg-blue-50 text-blue-700 border border-blue-100'
          : 'bg-amber-50 text-amber-700 border border-amber-100'
      }`}>
        {type === 'DO'
          ? 'After creating, go to Delivery Orders to add item contents per box.'
          : 'After creating, go to Surat Jalan to list the documents included (mock ups, invoices, receipts).'}
      </div>

      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Delivery' : `Create ${type === 'DO' ? 'Delivery Order' : 'Surat Jalan'}`}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function DeliveryPage() {
  const { data, isLoading } = deliveryHooks.useList()
  const del = deliveryHooks.useDelete()
  const navigate = useNavigate() 

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
      rowActions={row => (
        <button
          className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
          onClick={() => navigate(`/delivery/${encodeURIComponent(row.id)}`)}
          title="View contents">
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
    />
  )
}

// ─── Delivery Orders ──────────────────────────────────────────────────────────

function DeliveryOrderForm({ editing, onClose }: { editing: DeliveryItem | null; onClose: () => void }) {
  const create = deliveryItemHooks.useCreate()
  const update = deliveryItemHooks.useUpdate()
  const { data: deliveries = [] } = deliveryHooks.useList()

  const [form, setForm] = useState<CreateDeliveryItemRequest>({
    delivery_id: editing?.delivery_id ?? '',
    item_name:   editing?.item_name   ?? '',
    size:        editing?.size        ?? '',
    amount:      editing?.amount      ?? 1,
    boxnumber:   editing?.boxnumber ?? 0
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

export function DeliveryItemsPage() {
  const { data, isLoading } = deliveryItemHooks.useList()
  const del = deliveryItemHooks.useDelete()

  return (
    <CrudPage<DeliveryItem>
      title="Delivery Item"
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

