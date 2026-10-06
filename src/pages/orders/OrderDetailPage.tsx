import { useState, useEffect, useLayoutEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, FileText, Copy, Pencil, Building2, PackageSearch, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ConfirmDialog, FormField, formatRp, UppercaseField } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'
import { orderHooks, itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { itemsApi, invoicesApi } from '@/api'
import type { Item, CreateItemRequest } from '@/types'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'
import { Modal } from '@/components/ui/Modal'
import { OrderCosts } from '@/components/finance/OrderCosts'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// Keeps the caret in place while thousands separators come and go, by
// restoring how many digits are to its left.
function useFormattedNumberField(value: number, onValueChange: (n: number) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const digitsBeforeCaret = useRef<number | null>(null)
  const display = value ? formatThousands(String(value)) : ''

  useLayoutEffect(() => {
    if (!ref.current || digitsBeforeCaret.current == null) return
    let digits = 0
    let pos = display.length
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i])) digits++
      if (digits === digitsBeforeCaret.current) { pos = i + 1; break }
    }
    if (digitsBeforeCaret.current === 0) pos = 0
    ref.current.setSelectionRange(pos, pos)
  }, [display])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caretPos = e.target.selectionStart ?? raw.length
    digitsBeforeCaret.current = (raw.slice(0, caretPos).match(/\d/g) ?? []).length
    onValueChange(Number(stripCommas(raw)) || 0)
  }

  return { ref, display, onChange }
}

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

  // The picked catalogue entry, only to keep the select controlled: the fields
  // it fills stay editable.
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
    // Uppercase like typed entries: the backend merges duplicate items by exact
    // name and size.
    setForm(p => ({
      ...p,
      item_name: item.item_name.toUpperCase(),
      size: (item.size ?? '').toUpperCase(),
      price: price ?? p.price,
    }))
  }

  const subTotal = form.amount * form.price
  const priceField = useFormattedNumberField(form.price, price => setForm(p => ({ ...p, price })))

  const handleSubmit = () => {
    // A blank size is '' rather than null, so "no size" rows of the same item merge
    // (SQLite's unique index treats NULLs as distinct).
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <UppercaseField className="field" placeholder="e.g. Kemeja Server" value={form.item_name}
            onChange={v => setForm(p => ({ ...p, item_name: v }))} />
        </FormField>
        <FormField label="Size">
          <UppercaseField className="field" placeholder="e.g. S, M, L" value={form.size ?? ''}
            onChange={v => setForm(p => ({ ...p, size: v }))} />
        </FormField>
        <FormField label="Qty" required>
          {/* Whole items only; onChange also filters pasted text. */}
          <input
            className="field"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.amount || ''}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '')
              setForm(p => ({ ...p, amount: digits === '' ? 0 : Math.trunc(Number(digits)) }))
            }}
          />
        </FormField>
        <FormField label="Unit Price (Rp)" required>
          <input className="field font-mono" type="text" inputMode="numeric"
            ref={priceField.ref}
            value={priceField.display}
            onChange={priceField.onChange} />
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
  const isMobile = useIsMobile()

  const { data: order, isLoading: orderLoading, isError: orderError, refetch: refetchOrder } = orderHooks.useGet(orderId)
  const {
    data: orderItems = [],
    isLoading: itemsLoading, isError: itemsError, refetch: refetchItems,
  } = useQuery({
    queryKey: ['items', orderId],
    queryFn: () => itemsApi.getByOrder(orderId),
    enabled: !!orderId,
  })
  // A failed invoice fetch blocks the page: an empty list would offer to create
  // an invoice that already exists.
  const {
    data: allInvoices = [],
    isLoading: invoicesLoading, isError: invoicesError, refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list(),
    enabled: !!orderId,
  })

  const orderInvoices = allInvoices.filter(inv => inv.order_id === orderId)
  const dpInvoice = orderInvoices.find(inv => inv.type === 'dp') ?? null
  const pelunasanInvoice = orderInvoices.find(inv => inv.type === 'pelunasan') ?? null
  // A 0% DP is a full invoice: no DP wording, and no Pelunasan to collect.
  const dpIsFullPayment = !!dpInvoice && (dpInvoice.down_payment ?? 0) === 0

  const del = itemHooks.useDelete()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [duplicating, setDuplicating] = useState<Item | null>(null)
  const [invoiceFormType, setInvoiceFormType] = useState<'dp' | 'pelunasan' | 'cod' | null>(null)
  // Deleting an item asks first. One shared dialog, since rows are <tr>s.
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<Item | null>(null)

  // Coming from the invoice list's pencil opens that invoice's form once.
  useEffect(() => {
    const openType = (location.state as { openInvoiceType?: 'dp' | 'pelunasan' } | null)?.openInvoiceType
    if (openType) {
      setInvoiceFormType(openType)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const total = orderItems.reduce((s, i) => s + i.sub_total, 0)

  // Items with the same name (one per size) collapse into one row, in the order
  // they were added.
  const itemGroups: { name: string; items: Item[] }[] = []
  const groupIndex = new Map<string, number>()
  for (const item of orderItems) {
    const idx = groupIndex.get(item.item_name)
    if (idx === undefined) {
      groupIndex.set(item.item_name, itemGroups.length)
      itemGroups.push({ name: item.item_name, items: [item] })
    } else {
      itemGroups[idx].items.push(item)
    }
  }

  // Collapsed by default — expanding is opt-in per group, keyed by
  // item_name. Only matters for groups with 2+ items; single-item groups
  // never look at this since they don't render a toggle at all.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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

  if (orderLoading || itemsLoading || invoicesLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // A failed fetch shows Retry, not "Order not found".
  if (orderError || itemsError || invoicesError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this order — check your connection and try again.</p>
        <button onClick={() => { refetchOrder(); refetchItems(); refetchInvoices() }} className="btn-secondary">Retry</button>
      </div>
    )
  }
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
        {/* Wraps so the up to four buttons fit at phone width. */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 flex-wrap">
          <h2 className="font-semibold text-navy-900">Order Items ({orderItems.length})</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
              <Plus size={14} /> Add Item
            </button>
            {/* COD is a starting choice that makes a 0% DP invoice; after that there's only
               Update Invoice. */}
            {!dpInvoice && (
              <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('cod')}>
                <FileText size={14} /> Generate COD Invoice
              </button>
            )}
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

        {/* On phones the item form opens as a popup instead of pushing the list down. */}
        {showForm && isMobile && (
          <Modal
            title={editing ? 'Edit Item' : duplicating ? 'Duplicate Item' : 'Add Item'}
            onClose={closeForm}
          >
            <ItemForm
              orderId={orderId}
              clientId={order.client_id}
              editing={editing}
              prefill={duplicating ?? undefined}
              onClose={closeForm}
            />
          </Modal>
        )}
        {showForm && !isMobile && (
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
        {/* The list scrolls inside a fixed height so Total stays in view. */}
        {isMobile ? (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {orderItems.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No items yet — add one above</p>
            ) : itemGroups.map(group => {
              const rowActions = (item: Item) => (
                <div className="flex items-center gap-3 mt-2" onClick={e => e.stopPropagation()}>
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
                    className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50"
                    onClick={() => setConfirmDeleteItem(item)}
                    disabled={del.isPending}
                  >
                    Delete
                  </button>
                </div>
              )

              if (group.items.length === 1) {
                const item = group.items[0]
                return (
                  <div key={item.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.item_name}{item.size ? ` · ${item.size}` : ''}</span>
                      <span className="font-mono font-semibold shrink-0">{formatRp(item.sub_total)}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.amount} × {formatRp(item.price)}
                    </div>
                    {rowActions(item)}
                  </div>
                )
              }

              const groupQty = group.items.reduce((s, i) => s + i.amount, 0)
              const groupSubtotal = group.items.reduce((s, i) => s + i.sub_total, 0)
              const uniquePrices = new Set(group.items.map(i => i.price))
              const expanded = expandedGroups.has(group.name)

              return (
                <div key={group.name}>
                  <button
                    type="button"
                    className="w-full text-left p-4 flex items-center justify-between gap-2 hover:bg-slate-50"
                    onClick={() => toggleGroup(group.name)}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                      <span className="font-medium truncate">{group.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">({group.items.length} sizes)</span>
                    </span>
                    <span className="text-right shrink-0">
                      <div className="font-mono font-semibold">{formatRp(groupSubtotal)}</div>
                      <div className="text-xs text-slate-400">
                        {groupQty} pcs{uniquePrices.size === 1 ? ` · ${formatRp(group.items[0].price)}` : ''}
                      </div>
                    </span>
                  </button>
                  {expanded && group.items.map(item => (
                    <div key={item.id} className="px-4 pb-3 pl-9 bg-slate-50/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{item.size ?? '—'}</span>
                        <span className="font-mono font-semibold shrink-0">{formatRp(item.sub_total)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {item.amount} × {formatRp(item.price)}
                      </div>
                      {rowActions(item)}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
        <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 sticky top-0 bg-white z-10">
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
              ) : itemGroups.map(group => {
                // A single-size item (the common case for one-off items) —
                // no size variants to collapse, so it's just a plain row,
                // same as before grouping existed.
                if (group.items.length === 1) {
                  const item = group.items[0]
                  return (
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
                            className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50"
                            onClick={() => setConfirmDeleteItem(item)}
                            disabled={del.isPending}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                // Sizes of one item collapse into a row with the combined qty and subtotal;
                // the price shows only if every size shares it.
                const groupQty = group.items.reduce((s, i) => s + i.amount, 0)
                const groupSubtotal = group.items.reduce((s, i) => s + i.sub_total, 0)
                const uniquePrices = new Set(group.items.map(i => i.price))
                const expanded = expandedGroups.has(group.name)

                return (
                  <Fragment key={group.name}>
                    <tr
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleGroup(group.name)}
                    >
                      <td className="p-4 font-medium">
                        <div className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                          {group.name}
                        </div>
                      </td>
                      <td className="p-4 text-slate-400 text-xs">{group.items.length} sizes</td>
                      <td className="p-4 text-right">{groupQty}</td>
                      <td className="p-4 text-right font-mono">{uniquePrices.size === 1 ? formatRp(group.items[0].price) : '—'}</td>
                      <td className="p-4 text-right font-mono font-semibold">{formatRp(groupSubtotal)}</td>
                      <td className="p-4" />
                    </tr>
                    {expanded && group.items.map(item => (
                      <tr key={item.id} className="border-b border-slate-50 bg-slate-50/60 hover:bg-slate-100">
                        <td className="p-4 pl-9 text-slate-400 text-xs">↳</td>
                        <td className="p-4">{item.size ?? '—'}</td>
                        <td className="p-4 text-right">{item.amount}</td>
                        <td className="p-4 text-right font-mono">{formatRp(item.price)}</td>
                        <td className="p-4 text-right font-mono font-semibold">{formatRp(item.sub_total)}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}>
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
                              className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50"
                              onClick={() => setConfirmDeleteItem(item)}
                              disabled={del.isPending}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
        {orderItems.length > 0 && (
          <div className="flex items-center justify-between bg-navy-900 text-white p-4">
            <span className="font-semibold">Total</span>
            <span className="font-mono font-bold">{formatRp(total)}</span>
          </div>
        )}
      </div>

      <OrderCosts orderId={order.id} value={total} />

      {invoiceFormType && (
        <Modal
          title={
            invoiceFormType === 'cod'
              ? 'Generate COD Invoice'
              : invoiceFormType === 'dp'
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
            // COD is saved as a 'dp' invoice too.
            existingInvoice={invoiceFormType === 'pelunasan' ? pelunasanInvoice : dpInvoice}
            prefillFrom={invoiceFormType === 'pelunasan' ? dpInvoice : null}
            clientId={order.client_id}
            onClose={() => setInvoiceFormType(null)}
          />
        </Modal>
      )}

      {confirmDeleteItem && (
        <ConfirmDialog
          message={`Delete "${confirmDeleteItem.item_name}${confirmDeleteItem.size ? ` (${confirmDeleteItem.size})` : ''}" from this order?`}
          onConfirm={() => { del.mutate(confirmDeleteItem.id); setConfirmDeleteItem(null) }}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}
    </div>
  )
}