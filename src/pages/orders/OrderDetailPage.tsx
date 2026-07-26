import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, FileText, Copy, Pencil, Building2, PackageSearch } from 'lucide-react'
import { format } from 'date-fns'
import { FormField, formatRp, UppercaseField } from '@/components/ui'
import { orderHooks, itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { itemsApi, invoicesApi } from '@/api'
import type { Item, CreateItemRequest } from '@/types'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'
import { Modal } from '@/components/ui/Modal'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

function ItemForm({
  orderId,
  clientId,
  editing,
  prefill,
  onClose,
}: {
  orderId: string
  clientId: number | null
  editing: Item | null
  prefill?: Item
  onClose: () => void
}) {
  const create = itemHooks.useCreate()
  const update = itemHooks.useUpdate()

  // Only fetched when the order is actually linked to a client — an
  // unlinked order just skips straight to the free-text fields below.
  const { data: catalogue = [] } = clientItemHooks.useByClient(clientId ?? undefined)
  const { data: pricesGrouped = {} } = clientItemPriceHooks.useGrouped()

  const latestPriceFor = (clientItemId: number) => {
    const history = pricesGrouped[String(clientItemId)] ?? []
    if (history.length === 0) return undefined
    return [...history].sort((a, b) => b.year - a.year)[0].price
  }

  // Tracks which catalogue entry (if any) was picked, purely to keep the
  // select controlled — the actual item_name/size/price below are plain
  // form fields once filled, so picking from the catalogue is a shortcut,
  // not a lock: everything stays editable afterward, and typing a name
  // that doesn't match anything in the catalogue works exactly as before.
  const [catalogueItemId, setCatalogueItemId] = useState<number | ''>('')

  const [form, setForm] = useState<Omit<CreateItemRequest, 'sub_total'>>({
    order_id:  orderId,
    item_name: editing?.item_name ?? prefill?.item_name ?? '',
    size:      editing?.size      ?? prefill?.size      ?? '',
    amount:    editing?.amount    ?? prefill?.amount    ?? 1,
    price:     editing?.price     ?? prefill?.price     ?? 0,
  })

  const handlePickCatalogueItem = (idStr: string) => {
    if (!idStr) { setCatalogueItemId(''); return }
    const id = Number(idStr)
    const item = catalogue.find(c => c.id === id)
    if (!item) return
    setCatalogueItemId(id)
    const price = latestPriceFor(id)
    setForm(p => ({
      ...p,
      item_name: item.item_name,
      size: item.size ?? '',
      price: price ?? p.price,
    }))
  }

  const subTotal = form.amount * form.price

  const handleSubmit = () => {
    // Size is sent as '' rather than null when blank — SQLite treats every
    // NULL as distinct from every other NULL in a unique index, which
    // would otherwise stop two "no size" rows of the same item from ever
    // merging via idx_items_dedupe on the backend (see Items.go).
    const payload: CreateItemRequest = { ...form, size: form.size || '', sub_total: subTotal }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      // If this exact name+size+price already exists on the order, the
      // backend merges it into that row instead of creating a duplicate
      // (see PostItems' upsert) — no need to check for that here.
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
      {catalogue.length > 0 && (
        <FormField label="Pick from Catalogue (optional)">
          <div className="relative">
            <PackageSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select className="field pl-8" value={catalogueItemId} onChange={e => handlePickCatalogueItem(e.target.value)}>
              <option value="">Type manually instead…</option>
              {catalogue.map(c => (
                <option key={c.id} value={c.id}>{c.item_name}{c.size ? ` (${c.size})` : ''}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Fills in the name, size, and latest catalogue price below — everything stays editable, or just skip this and type the item directly.
          </p>
        </FormField>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <UppercaseField className="field" placeholder="e.g. Kemeja Server" value={form.item_name}
            onChange={v => setForm(p => ({ ...p, item_name: v }))} />
        </FormField>
        <FormField label="Size">
          <UppercaseField className="field" placeholder="e.g. S, M, L" value={form.size ?? ''}
            onChange={v => setForm(p => ({ ...p, size: v }))} />
        </FormField>
        <FormField label="Qty" required>
          <input className="field" type="number" min={1} value={form.amount || ''}
            onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
        </FormField>
        <FormField label="Unit Price (Rp)" required>
          <input className="field font-mono" type="text" inputMode="numeric"
            value={form.price ? formatThousands(String(form.price)) : ''}
            onChange={e => setForm(p => ({ ...p, price: Number(stripCommas(e.target.value)) || 0 }))} />
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
  const location = useLocation()
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

  const orderInvoices = allInvoices.filter(inv => inv.order_id === orderId)
  const dpInvoice = orderInvoices.find(inv => inv.type === 'dp') ?? null
  const pelunasanInvoice = orderInvoices.find(inv => inv.type === 'pelunasan') ?? null
  // A 0% down payment isn't really a "down payment" — it's the full amount
  // due in one invoice, with nothing left over for a second (Pelunasan)
  // invoice to collect. Still stored/typed as 'dp' under the hood (no
  // schema change needed), but the UI treats it as a plain invoice: the
  // button/modal drop the "DP" wording, and the Pelunasan button — which
  // would otherwise offer to collect a remaining balance of Rp 0 — is
  // hidden entirely rather than left there to be confusing.
  const dpIsFullPayment = !!dpInvoice && (dpInvoice.down_payment ?? 0) === 0

  const del = itemHooks.useDelete()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [duplicating, setDuplicating] = useState<Item | null>(null)
  const [invoiceFormType, setInvoiceFormType] = useState<'dp' | 'pelunasan' | null>(null)

  // Arriving here from InvoiceListPage's pencil icon carries which invoice
  // type to edit in navigation state — open that form immediately, then
  // clear the state so navigating back/forward or refreshing doesn't
  // re-trigger it.
  useEffect(() => {
    const openType = (location.state as { openInvoiceType?: 'dp' | 'pelunasan' } | null)?.openInvoiceType
    if (openType) {
      setInvoiceFormType(openType)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

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
          <p className="text-sm text-slate-500">
            {order.company} · {order.date ? format(new Date(order.date), 'dd MMM yyyy') : '—'}
            {order.client_id && (
              <>
                {' · '}
                <button
                  className="inline-flex items-center gap-1 text-navy-600 hover:underline"
                  onClick={() => navigate(`/clients/${order.client_id}`)}
                >
                  <Building2 size={12} /> Client record
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-navy-900">Order Items ({orderItems.length})</h2>
          <div className="flex items-center gap-2">
            <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
              <Plus size={14} /> Add Item
            </button>
            <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('dp')}>
              <FileText size={14} />
              {!dpInvoice ? 'Generate DP Invoice' : dpIsFullPayment ? 'Update Invoice' : 'Update DP Invoice'}
            </button>
            {dpInvoice && !dpIsFullPayment && (
              <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('pelunasan')}>
                <FileText size={14} /> {pelunasanInvoice ? 'Update Pelunasan Invoice' : 'Generate Pelunasan Invoice'}
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <ItemForm
              orderId={orderId}
              clientId={order.client_id}
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

      {invoiceFormType && (
        <Modal
          title={
            invoiceFormType === 'dp'
              ? (!dpInvoice ? 'Generate DP Invoice' : dpIsFullPayment ? 'Update Invoice' : 'Update DP Invoice')
              : (pelunasanInvoice ? 'Update Pelunasan Invoice' : 'Generate Pelunasan Invoice')
          }
          onClose={() => setInvoiceFormType(null)}
          size="lg"
        >
          <GenerateInvoiceForm
            order={order}
            items={orderItems}
            forcedType={invoiceFormType}
            existingInvoice={invoiceFormType === 'dp' ? dpInvoice : pelunasanInvoice}
            prefillFrom={invoiceFormType === 'pelunasan' ? dpInvoice : null}
            clientId={order.client_id}
            onClose={() => setInvoiceFormType(null)}
          />
        </Modal>
      )}
    </div>
  )
}