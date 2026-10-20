import { useState, useEffect, useLayoutEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, FileText, Copy, Pencil, Building2, PackageSearch, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog, FormField, formatRp, UppercaseField } from '@/components/ui'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { useIsMobile } from '@/hooks/useIsMobile'
import { orderHooks, itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { itemsApi, invoicesApi } from '@/api'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Item, CreateItemRequest } from '@/types'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'
import { Modal } from '@/components/ui/Modal'
import { OrderCosts } from '@/components/finance/OrderCosts'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'
import { priceForYear } from '@/utils/PriceHistory'

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
  orderYear,
  editing,
  prefill,
  onClose,
}: {
  orderId: string
  clientId: number | null
  orderYear: number
  editing: Item | null
  prefill?: Item
  onClose: () => void
}) {
  const { t } = useTranslation()
  const create = itemHooks.useCreate()
  const update = itemHooks.useUpdate()

  // Only fetched when the order is actually linked to a client — an
  // unlinked order just skips straight to the free-text fields below.
  const { data: catalogue = [] } = clientItemHooks.useByClient(clientId ?? undefined)
  const { data: pricesGrouped = {} } = clientItemPriceHooks.useGrouped()

  // The catalogue price for the order's year, not one already set for next year.
  const latestPriceFor = (clientItemId: number) => priceForYear(pricesGrouped[String(clientItemId)] ?? [], orderYear)?.price

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
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400">
          {t('orders.itemForm.duplicatedFrom', { name: prefill.item_name, size: prefill.size || t('orders.itemForm.noSize') })}
        </div>
      )}
      {catalogue.length > 0 && (
        <FormField label={t('orders.itemForm.pickFromCatalogue')}>
          <div className="relative">
            <PackageSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none dark:text-slate-500" />
            <select className="field pl-8" value={catalogueItemId} onChange={e => handlePickCatalogueItem(e.target.value)}>
              <option value="">{t('orders.itemForm.typeManually')}</option>
              {catalogue.map(c => (
                <option key={c.id} value={c.id}>{c.item_name}{c.size ? ` (${c.size})` : ''}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
            {t('orders.itemForm.catalogueHint')}
          </p>
        </FormField>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('orders.itemForm.itemName')} required>
          <UppercaseField className="field" placeholder={t('orders.itemForm.itemNamePlaceholder')} value={form.item_name}
            onChange={v => setForm(p => ({ ...p, item_name: v }))} />
        </FormField>
        <FormField label={t('orders.itemForm.size')}>
          <UppercaseField className="field" placeholder={t('orders.itemForm.sizePlaceholder')} value={form.size ?? ''}
            onChange={v => setForm(p => ({ ...p, size: v }))} />
        </FormField>
        <FormField label={t('orders.itemForm.qty')} required>
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
        <FormField label={t('orders.itemForm.unitPrice')} required>
          <input className="field font-mono" type="text" inputMode="numeric"
            ref={priceField.ref}
            value={priceField.display}
            onChange={priceField.onChange} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between dark:bg-navy-950">
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('orders.itemForm.subtotal')}</span>
        <span className="font-mono font-semibold">{formatRp(subTotal)}</span>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? t('common.saving') : editing ? t('orders.itemForm.updateItem') : t('orders.itemForm.addItem')}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
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
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

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

  if (orderLoading || itemsLoading || invoicesLoading) return <div className="p-4 md:p-6"><LoadingState label={t('orders.detail.loading')} /></div>
  // A failed fetch shows Retry, not "Order not found".
  if (orderError || itemsError || invoicesError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState what={t('orders.detail.errorWhat')} onRetry={() => { refetchOrder(); refetchItems(); refetchInvoices() }} />
      </div>
    )
  }
  if (!order) return <div className="p-4 md:p-6"><ErrorState what={t('orders.detail.errorWhat')} /></div>

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3 fade-up">
        <button onClick={() => navigate('/orders')} className="btn-secondary !px-2.5 shrink-0" title={t('orders.backToOrders')}>
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-navy-900 leading-tight dark:text-slate-50">{order.id}</h1>
          <p className="text-slate-400 text-xs truncate dark:text-slate-500">
            {order.company} · {order.date ? format(new Date(order.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}
            {order.client_id && (
              <>
                {' · '}
                <button
                  className="inline-flex items-center gap-1 text-navy-500 hover:underline"
                  onClick={() => navigate(`/clients/${order.client_id}`)}
                >
                  <Building2 size={11} /> {t('common.clientRecord')}
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        {/* Wraps so the up to four buttons fit at phone width. */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 flex-wrap dark:border-navy-800">
          <h2 className="font-semibold text-navy-900 dark:text-slate-50">{t('orders.detail.orderItems', { count: orderItems.length })}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
              <Plus size={14} /> {t('orders.detail.addItem')}
            </button>
            {/* COD is a starting choice that makes a 0% DP invoice; after that there's only
               Update Invoice. */}
            {!dpInvoice && (
              <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('cod')}>
                <FileText size={14} /> {t('orders.detail.generateCodInvoice')}
              </button>
            )}
            <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('dp')}>
              <FileText size={14} />
              {!dpInvoice ? t('orders.detail.generateDpInvoice') : dpIsFullPayment ? t('orders.detail.updateInvoice') : t('orders.detail.updateDpInvoice')}
            </button>
            {dpInvoice && !dpIsFullPayment && (
              <button className="btn-secondary flex items-center gap-1" onClick={() => setInvoiceFormType('pelunasan')}>
                <FileText size={14} /> {pelunasanInvoice ? t('orders.detail.updatePelunasanInvoice') : t('orders.detail.generatePelunasanInvoice')}
              </button>
            )}
          </div>
        </div>

        {/* On phones the item form opens as a popup instead of pushing the list down. */}
        {showForm && isMobile && (
          <Modal
            title={editing ? t('items.formTitleEdit') : duplicating ? t('orders.detail.duplicateItemTitle') : t('orders.detail.addItem')}
            onClose={closeForm}
          >
            <ItemForm
              orderId={orderId}
              clientId={order.client_id}
              orderYear={order.date ? new Date(order.date).getFullYear() : new Date().getFullYear()}
              editing={editing}
              prefill={duplicating ?? undefined}
              onClose={closeForm}
            />
          </Modal>
        )}
        {showForm && !isMobile && (
          <div className="p-4 border-b border-slate-100 bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
            <ItemForm
              orderId={orderId}
              clientId={order.client_id}
              orderYear={order.date ? new Date(order.date).getFullYear() : new Date().getFullYear()}
              editing={editing}
              prefill={duplicating ?? undefined}
              onClose={closeForm}
            />
          </div>
        )}
        {/* The list scrolls inside a fixed height so Total stays in view. */}
        {isMobile ? (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50 dark:divide-navy-800/60">
            {orderItems.length === 0 ? (
              <p className="text-center text-slate-400 py-8 dark:text-slate-500">{t('orders.detail.noItemsYetAddOne')}</p>
            ) : itemGroups.map(group => {
              const rowActions = (item: Item) => (
                <div className="flex items-center gap-3 mt-2" onClick={e => e.stopPropagation()}>
                  <button
                    className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1 dark:text-slate-500"
                    onClick={() => openDuplicate(item)}
                    title={t('orders.detail.duplicateTooltip')}
                  >
                    <Copy size={12} /> {t('orders.detail.copy')}
                  </button>
                  <button
                    className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1 dark:text-slate-500"
                    onClick={() => openEdit(item)}
                    title={t('orders.detail.editTooltip')}
                  >
                    <Pencil size={12} /> {t('orders.detail.edit')}
                  </button>
                  <button
                    className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50 dark:text-slate-500"
                    onClick={() => setConfirmDeleteItem(item)}
                    disabled={del.isPending}
                  >
                    {t('orders.detail.delete')}
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
                    <div className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">
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
                    className="w-full text-left p-4 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-white/5"
                    onClick={() => toggleGroup(group.name)}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0 dark:text-slate-500" /> : <ChevronRight size={14} className="text-slate-400 shrink-0 dark:text-slate-500" />}
                      <span className="font-medium truncate">{group.name}</span>
                      <span className="text-xs text-slate-400 shrink-0 dark:text-slate-500">({t('orders.detail.sizesCount', { count: group.items.length })})</span>
                    </span>
                    <span className="text-right shrink-0">
                      <div className="font-mono font-semibold">{formatRp(groupSubtotal)}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {t('common.pcs', { count: groupQty })}{uniquePrices.size === 1 ? ` · ${formatRp(group.items[0].price)}` : ''}
                      </div>
                    </span>
                  </button>
                  {expanded && group.items.map(item => (
                    <div key={item.id} className="px-4 pb-3 pl-9 bg-slate-50/60 dark:bg-white/5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{item.size ?? '—'}</span>
                        <span className="font-mono font-semibold shrink-0">{formatRp(item.sub_total)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 dark:text-slate-500">
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
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 sticky top-0 bg-white z-10 dark:text-slate-500 dark:border-navy-800 dark:bg-navy-900">
                <th className="text-left p-4">{t('orders.detail.item')}</th>
                <th className="text-left p-4">{t('orders.detail.size')}</th>
                <th className="text-right p-4">{t('orders.detail.qty')}</th>
                <th className="text-right p-4">{t('orders.detail.price')}</th>
                <th className="text-right p-4">{t('orders.detail.subtotal')}</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {orderItems.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8 dark:text-slate-500">{t('orders.detail.noItemsYetAddOne')}</td></tr>
              ) : itemGroups.map(group => {
                // A single-size item (the common case for one-off items) —
                // no size variants to collapse, so it's just a plain row,
                // same as before grouping existed.
                if (group.items.length === 1) {
                  const item = group.items[0]
                  return (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 dark:border-navy-800/60 dark:hover:bg-white/5">
                      <td className="p-4 font-medium">{item.item_name}</td>
                      <td className="p-4">{item.size ?? '—'}</td>
                      <td className="p-4 text-right">{item.amount}</td>
                      <td className="p-4 text-right font-mono">{formatRp(item.price)}</td>
                      <td className="p-4 text-right font-mono font-semibold">{formatRp(item.sub_total)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1 dark:text-slate-500"
                            onClick={() => openDuplicate(item)}
                            title={t('orders.detail.duplicateTooltip')}
                          >
                            <Copy size={12} /> {t('orders.detail.copy')}
                          </button>
                          <button
                            className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1 dark:text-slate-500"
                            onClick={() => openEdit(item)}
                            title={t('orders.detail.editTooltip')}
                          >
                            <Pencil size={12} /> {t('orders.detail.edit')}
                          </button>
                          <button
                            className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50 dark:text-slate-500"
                            onClick={() => setConfirmDeleteItem(item)}
                            disabled={del.isPending}
                          >
                            {t('orders.detail.delete')}
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
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer dark:border-navy-800/60 dark:hover:bg-white/5"
                      onClick={() => toggleGroup(group.name)}
                    >
                      <td className="p-4 font-medium">
                        <div className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0 dark:text-slate-500" /> : <ChevronRight size={14} className="text-slate-400 shrink-0 dark:text-slate-500" />}
                          {group.name}
                        </div>
                      </td>
                      <td className="p-4 text-slate-400 text-xs dark:text-slate-500">{t('orders.detail.sizesCount', { count: group.items.length })}</td>
                      <td className="p-4 text-right">{groupQty}</td>
                      <td className="p-4 text-right font-mono">{uniquePrices.size === 1 ? formatRp(group.items[0].price) : '—'}</td>
                      <td className="p-4 text-right font-mono font-semibold">{formatRp(groupSubtotal)}</td>
                      <td className="p-4" />
                    </tr>
                    {expanded && group.items.map(item => (
                      <tr key={item.id} className="border-b border-slate-50 bg-slate-50/60 hover:bg-slate-100 dark:border-navy-800/60 dark:bg-white/5 dark:hover:bg-white/10">
                        <td className="p-4 pl-9 text-slate-400 text-xs dark:text-slate-500">↳</td>
                        <td className="p-4">{item.size ?? '—'}</td>
                        <td className="p-4 text-right">{item.amount}</td>
                        <td className="p-4 text-right font-mono">{formatRp(item.price)}</td>
                        <td className="p-4 text-right font-mono font-semibold">{formatRp(item.sub_total)}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}>
                            <button
                              className="text-slate-400 hover:text-gold-500 text-xs flex items-center gap-1 dark:text-slate-500"
                              onClick={() => openDuplicate(item)}
                              title={t('orders.detail.duplicateTooltip')}
                            >
                              <Copy size={12} /> {t('orders.detail.copy')}
                            </button>
                            <button
                              className="text-slate-400 hover:text-blue-500 text-xs flex items-center gap-1 dark:text-slate-500"
                              onClick={() => openEdit(item)}
                              title={t('orders.detail.editTooltip')}
                            >
                              <Pencil size={12} /> {t('orders.detail.edit')}
                            </button>
                            <button
                              className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50 dark:text-slate-500"
                              onClick={() => setConfirmDeleteItem(item)}
                              disabled={del.isPending}
                            >
                              {t('orders.detail.delete')}
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
            <span className="font-semibold">{t('orders.detail.total')}</span>
            <span className="font-mono font-bold">{formatRp(total)}</span>
          </div>
        )}
      </div>

      <OrderCosts orderId={order.id} value={total} />

      {invoiceFormType && (
        <Modal
          title={
            invoiceFormType === 'cod'
              ? t('orders.detail.generateCodInvoice')
              : invoiceFormType === 'dp'
                ? (!dpInvoice ? t('orders.detail.generateDpInvoice') : dpIsFullPayment ? t('orders.detail.updateInvoice') : t('orders.detail.updateDpInvoice'))
                : (pelunasanInvoice ? t('orders.detail.updatePelunasanInvoice') : t('orders.detail.generatePelunasanInvoice'))
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
          message={t('orders.detail.deleteConfirm', { name: `${confirmDeleteItem.item_name}${confirmDeleteItem.size ? ` (${confirmDeleteItem.size})` : ''}` })}
          onConfirm={() => { del.mutate(confirmDeleteItem.id); setConfirmDeleteItem(null) }}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}
    </div>
  )
}