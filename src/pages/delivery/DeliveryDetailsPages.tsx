import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { deliveryItemApi } from '@/api'
import { useState } from 'react'
import { ArrowLeft, Plus, Copy, Pencil} from 'lucide-react'
import { format } from 'date-fns'
import { FormField } from '@/components/ui'
import { deliveryHooks, deliveryItemHooks} from '@/hooks'
import type {
  Delivery, CreateDeliveryRequest,
  DeliveryItem, CreateDeliveryItemRequest
} from '@/types'

function DeliveryItemForm({
  deliveryId,
  deliveryType,
  editing,
  prefill,
  onClose,
}: {
  deliveryId: string
  deliveryType: string
  editing: DeliveryItem | null
  prefill?: DeliveryItem
  onClose: () => void
}) {
  const create = deliveryItemHooks.useCreate()
  const update = deliveryItemHooks.useUpdate()

  const [form, setForm] = useState<CreateDeliveryItemRequest>({
    delivery_id: deliveryId,
    item_name:   editing?.item_name ?? prefill?.item_name ?? '',
    size:        editing?.size      ?? prefill?.size      ?? '',
    amount:      editing?.amount    ?? prefill?.amount    ?? 1,
    boxnumber:   editing?.boxnumber ?? prefill?.boxnumber ?? null,
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
  const isDO = deliveryType === 'DO'

  return (
    <div className="space-y-4">
      {prefill && !editing && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
          Duplicated from <span className="font-semibold">{prefill.item_name}</span> — modify as needed.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label={isDO ? 'Item Name' : 'Document Name'} required>
          <input className="field" placeholder={isDO ? 'e.g. Kemeja Server' : 'e.g. Invoice, Mock Up'}
            value={form.item_name}
            onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} />
        </FormField>
        {isDO && (
          <FormField label="Size">
            <input className="field" placeholder="e.g. S, M, L"
              value={form.size ?? ''}
              onChange={e => setForm(p => ({ ...p, size: e.target.value }))} />
          </FormField>
        )}
        <FormField label="Amount" required>
          <input className="field" type="number" min={1} value={form.amount || ''}
            onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
        </FormField>
        {isDO && (
          <FormField label="Box Number">
            <input className="field" type="number" min={1} value={form.boxnumber || ''}
              placeholder="e.g. 1, 2, 3"
              onChange={e => setForm(p => ({ ...p, boxnumber: Number(e.target.value) || null }))} />
          </FormField>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update' : isDO ? 'Add Item' : 'Add Document'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const deliveryId = decodeURIComponent(id ?? '')

  const { data: delivery, isLoading: deliveryLoading } = deliveryHooks.useGet(deliveryId)
  const { data: deliveryItems = [] } = useQuery({
    queryKey: ['delivery-items', deliveryId],
    queryFn:  () => deliveryItemApi.list().then(items => items.filter((i: DeliveryItem) => i.delivery_id === deliveryId)),
    enabled:  !!deliveryId,
  })

  const del = deliveryItemHooks.useDelete()
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<DeliveryItem | null>(null)
  const [duplicating, setDuplicating] = useState<DeliveryItem | null>(null)

  const openAdd = () => { setEditing(null); setDuplicating(null); setShowForm(true) }
  const openEdit = (item: DeliveryItem) => { setEditing(item); setDuplicating(null); setShowForm(true) }
  const openDuplicate = (item: DeliveryItem) => { setEditing(null); setDuplicating(item); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null); setDuplicating(null) }

  const isDO = delivery?.type === 'DO'

  if (deliveryLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!delivery) return <div className="p-8 text-red-400">Delivery not found.</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/delivery')} className="btn-secondary flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900">{delivery.id}</h1>
            <span className={`badge text-xs ${isDO ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {isDO ? 'Delivery Order' : 'Surat Jalan'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {delivery.address}
            {delivery.contact_person && ` · ${delivery.contact_person}`}
            {delivery.date && ` · ${format(new Date(delivery.date), 'dd MMM yyyy')}`}
          </p>
        </div>
      </div>

      {/* Items card */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-navy-900">
            {isDO ? 'Box Contents' : 'Documents'} ({deliveryItems.length})
          </h2>
          <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
            <Plus size={14} /> {isDO ? 'Add Item' : 'Add Document'}
          </button>
        </div>

        {showForm && (
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <DeliveryItemForm
              deliveryId={deliveryId}
              deliveryType={delivery.type}
              editing={editing}
              prefill={duplicating ?? undefined}
              onClose={closeForm}
            />
          </div>
        )}

        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                {isDO && <th className="text-center p-4">Box</th>}
                <th className="text-left p-4">{isDO ? 'Item' : 'Document'}</th>
                {isDO && <th className="text-left p-4">Size</th>}
                <th className="text-right p-4">Amount</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {deliveryItems.length === 0 ? (
                <tr>
                  <td colSpan={isDO ? 5 : 3} className="text-center text-slate-400 py-8">
                    No {isDO ? 'items' : 'documents'} yet — add one above
                  </td>
                </tr>
              ) : deliveryItems.map(item => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                  {isDO && <td className="p-4 text-center font-mono text-slate-400">{item.boxnumber ?? '—'}</td>}
                  <td className="p-4 font-medium">{item.item_name}</td>
                  {isDO && <td className="p-4">{item.size ?? '—'}</td>}
                  <td className="p-4 text-right">{item.amount}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1"
                        onClick={() => openDuplicate(item)}>
                        <Copy size={12} /> Copy
                      </button>
                      <button className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1"
                        onClick={() => openEdit(item)}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button className="text-slate-400 hover:text-red-500 text-xs"
                        onClick={() => del.mutate(item.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}