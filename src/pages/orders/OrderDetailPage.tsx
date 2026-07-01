import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, FileText, Copy, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { FormField, formatRp } from '@/components/ui'
import { orderHooks, itemHooks } from '@/hooks'
import { itemsApi, invoicesApi } from '@/api'
import type { Item, CreateItemRequest } from '@/types'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'
import { Modal } from '@/components/ui/Modal'

function ItemForm({
  orderId,
  editing,
  prefill,
  onClose,
}: {
  orderId: string
  editing: Item | null
  prefill?: Item
  onClose: () => void
}) {
  const create = itemHooks.useCreate()
  const update = itemHooks.useUpdate()

  const [form, setForm] = useState<Omit<CreateItemRequest, 'sub_total'>>({
    order_id:  orderId,
    item_name: editing?.item_name ?? prefill?.item_name ?? '',
    size:      editing?.size      ?? prefill?.size      ?? '',
    amount:    editing?.amount    ?? prefill?.amount    ?? 1,
    price:     editing?.price     ?? prefill?.price     ?? 0,
  })

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
      {prefill && !editing && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
          Duplicated from <span className="font-semibold">{prefill.item_name} ({prefill.size ?? 'no size'})</span> — modify as needed.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <input className="field" placeholder="e.g. Kemeja Server" value={form.item_name}
            onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} />
        </FormField>
        <FormField label="Size">
          <input className="field" placeholder="e.g. S, M, L" value={form.size ?? ''}
            onChange={e => setForm(p => ({ ...p, size: e.target.value }))} />
        </FormField>
        <FormField label="Qty" required>
          <input className="field" type="number" min={1} value={form.amount || ''}
            onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
        </FormField>
        <FormField label="Unit Price (Rp)" required>
          <input className="field font-mono" type="number" min={0} value={form.price || ''}
            onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between">
        <span className="text-sm text-slate-500">Subtotal</span>
        <span className="font-mono font-semibold">{formatRp(subTotal)}</span>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = decodeURIComponent(id ?? '')

  const { data: order, isLoading: orderLoading } = orderHooks.useGet(orderId)
  const { data: orderItems = [] } = useQuery({
    queryKey: ['items', orderId],
    queryFn: () => itemsApi.getByOrder(orderId),
    enabled: !!orderId,
  })
  const { data: allInvoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list(),
    enabled: !!orderId,
  })

  const existingInvoice = allInvoices.find(inv => inv.order_id === orderId) ?? null

  const del = itemHooks.useDelete()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [duplicating, setDuplicating] = useState<Item | null>(null)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)

  const total = orderItems.reduce((s, i) => s + i.sub_total, 0)

  const openAdd = () => {
    setEditing(null)
    setDuplicating(null)
    setShowForm(true)
  }

  const openEdit = (item: Item) => {
    setEditing(item)
    setDuplicating(null)
    setShowForm(true)
  }

  const openDuplicate = (item: Item) => {
    setEditing(null)
    setDuplicating(item)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setDuplicating(null)
  }

  if (orderLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!order) return <div className="p-8 text-red-400">Order not found.</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/orders')} className="btn-secondary flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
        <div>
          <h1 className="text-xl font-bold text-navy-900">{order.id}</h1>
          <p className="text-sm text-slate-500">{order.company} · {order.date ? format(new Date(order.date), 'dd MMM yyyy') : '—'}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-navy-900">Order Items ({orderItems.length})</h2>
          <div className="flex items-center gap-2">
            <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
              <Plus size={14} /> Add Item
            </button>
            <button className="btn-secondary flex items-center gap-1" onClick={() => setShowInvoiceForm(true)}>
              <FileText size={14} /> {existingInvoice ? 'Update Invoice' : 'Generate Invoice'}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <ItemForm
              orderId={orderId}
              editing={editing}
              prefill={duplicating ?? undefined}
              onClose={closeForm}
            />
          </div>
        )}
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="text-left p-4">Item</th>
                <th className="text-left p-4">Size</th>
                <th className="text-right p-4">Qty</th>
                <th className="text-right p-4">Price</th>
                <th className="text-right p-4">Subtotal</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {orderItems.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">No items yet — add one above</td></tr>
              ) : orderItems.map(item => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-4 font-medium">{item.item_name}</td>
                  <td className="p-4">{item.size ?? '—'}</td>
                  <td className="p-4 text-right">{item.amount}</td>
                  <td className="p-4 text-right font-mono">{formatRp(item.price)}</td>
                  <td className="p-4 text-right font-mono font-semibold">{formatRp(item.sub_total)}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1"
                        onClick={() => openDuplicate(item)}
                        title="Duplicate item"
                      >
                        <Copy size={12} /> Copy
                      </button>
                      <button
                        className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1"
                        onClick={() => openEdit(item)}
                        title="Edit item"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        className="text-slate-400 hover:text-red-500 text-xs"
                        onClick={() => del.mutate(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {orderItems.length > 0 && (
            <tfoot className="sticky bottom-0">
              <tr className="bg-navy-900 text-white">
                <td colSpan={4} className="p-4 font-semibold">Total</td>
                <td className="p-4 text-right font-mono font-bold">{formatRp(total)}</td>
                <td />
              </tr>
            </tfoot>
            )}
          </table>
        </div>
      </div>

      {showInvoiceForm && (
        <Modal title={existingInvoice ? 'Update Invoice' : 'Generate Invoice'} onClose={() => setShowInvoiceForm(false)} size="lg">
          <GenerateInvoiceForm
            order={order}
            items={orderItems}
            existingInvoice={existingInvoice}
            onClose={() => setShowInvoiceForm(false)}
          />
        </Modal>
      )}
    </div>
  )
}