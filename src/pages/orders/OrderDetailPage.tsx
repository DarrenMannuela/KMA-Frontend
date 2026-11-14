import { useState, useEffect, useLayoutEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, FileText, Copy, Pencil, Building2, PackageSearch, ChevronDown, ChevronRight, Ban, RotateCcw } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog, FormField, formatRp, UppercaseField } from '@/components/ui'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { useIsMobile } from '@/hooks/useIsMobile'
import { orderHooks, itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { itemsApi, invoicesApi, ordersApi } from '@/api'
import { friendlyError } from '@/utils/friendlyError'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Item, CreateItemRequest, Invoice } from '@/types'
import { invoiceAmount } from '@/utils/invoiceAmount'
import { orderPaymentStatus, isPastDue } from '@/utils/orderStatus'
import { GenerateInvoiceForm } from './GenerateInvoiceForm'
import { Modal } from '@/components/ui/Modal'
import { OrderCosts } from '@/components/finance/OrderCosts'
import { OrderJourney } from '@/components/orders/OrderJourney'
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

// ─── Payment panel ────────────────────────────────────────────────────────────
// Where the order's money stands, one tile per invoice (DP and Pelunasan, or
// the single full invoice), each with its own make/update button, so the
// items card above only deals with items.
function InvoiceTile({ label, invoice, allInvoices, actionLabel, onAction, locked = false }: {
  label: string
  invoice: Invoice | null
  allInvoices: Invoice[]
  actionLabel: string
  onAction: () => void
  /** The order is cancelled: nothing to generate or update. */
  locked?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dateLocale = useDateLocale()
  const fmt = (d: string) => format(new Date(d), 'dd MMM yyyy', { locale: dateLocale })

  let state: { text: string; className: string } | null = null
  if (invoice) {
    if (invoice.status === 'cancelled') {
      state = { text: t('orders.detail.cancel.invoiceCancelled'), className: 'text-slate-500 dark:text-slate-400' }
    } else if (invoice.status === 'paid') {
      state = { text: invoice.paid_date ? t('orders.detail.payment.paidOn', { date: fmt(invoice.paid_date) }) : t('common.paid'), className: 'text-green-700 dark:text-green-400' }
    } else if (isPastDue(invoice)) {
      const days = differenceInCalendarDays(new Date(), new Date(invoice.due_date!))
      state = { text: `${t('dashboard.overdueBy', { count: days })} · ${fmt(invoice.due_date!)}`, className: 'text-red-600 font-semibold dark:text-red-400' }
    } else {
      state = { text: invoice.due_date ? t('orders.detail.payment.dueOn', { date: fmt(invoice.due_date) }) : t('orders.detail.payment.noDueDate'), className: 'text-slate-500 dark:text-slate-400' }
    }
  }

  return (
    <div className={`rounded-xl border p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 min-w-0 ${invoice ? 'border-slate-200 dark:border-navy-700' : 'border-dashed border-slate-300 dark:border-navy-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          {invoice ? (
            <button
              type="button"
              onClick={() => navigate(`/invoice/${encodeURIComponent(invoice.id)}`)}
              className="tap font-mono text-sm text-navy-700 hover:underline dark:text-navy-200"
              title={t('orders.detail.payment.open')}
            >
              {invoice.id}
            </button>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('orders.detail.payment.notYet')}</p>
          )}
        </div>
        {invoice && (
          <span className={invoice.status === 'cancelled' ? 'badge-slate line-through decoration-slate-400' : invoice.status === 'paid' ? 'badge-green' : isPastDue(invoice) ? 'badge-red' : 'badge-blue'}>
            {invoice.status === 'cancelled' ? t('dashboardKpi.paymentStatus.cancelled') : invoice.status === 'paid' ? t('common.paid') : t('common.unpaid')}
          </span>
        )}
      </div>
      {/* Amount on the left, its button on the right; they stack only when
          the tile is too narrow for both. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        {invoice && (
          <div className="min-w-0">
            <p className="currency text-lg font-semibold whitespace-nowrap text-navy-900 dark:text-slate-50">{formatRp(invoiceAmount(invoice, allInvoices))}</p>
            {state && <p className={`text-xs ${state.className}`}>{state.text}</p>}
          </div>
        )}
        {!locked && (
          <button type="button" className={`${invoice ? 'btn-secondary' : 'btn-primary'} btn-sm`} onClick={onAction}>
            <FileText size={14} aria-hidden /> {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function OrderPayment({ orderId, cancelled, dpInvoice, pelunasanInvoice, allInvoices, onOpenForm }: {
  orderId: string
  cancelled: boolean
  dpInvoice: Invoice | null
  pelunasanInvoice: Invoice | null
  allInvoices: Invoice[]
  onOpenForm: (type: 'dp' | 'pelunasan' | 'cod') => void
}) {
  const { t } = useTranslation()
  const status = orderPaymentStatus(orderId, allInvoices, cancelled)
  const full = !!dpInvoice && (dpInvoice.down_payment ?? 0) === 0

  return (
    <section className="card p-4 sm:p-5 fade-up">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-navy-900 dark:text-slate-50">{t('orders.detail.payment.title')}</h2>
        <span className={status.className}>{status.label}</span>
      </div>
      {!dpInvoice && cancelled ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('orders.detail.cancel.neverInvoiced')}</p>
      ) : !dpInvoice ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-slate-500 flex-1 dark:text-slate-400">{t('orders.detail.payment.noInvoice')}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => onOpenForm('dp')}>
              <FileText size={14} aria-hidden /> {t('orders.detail.generateDpInvoice')}
            </button>
            <button className="btn-secondary" onClick={() => onOpenForm('cod')}>
              <FileText size={14} aria-hidden /> {t('orders.detail.generateCodInvoice')}
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${full ? '' : 'sm:grid-cols-2'}`}>
          <InvoiceTile
            label={full ? t('orders.detail.payment.fullInvoice') : 'DP'}
            invoice={dpInvoice}
            allInvoices={allInvoices}
            actionLabel={full ? t('orders.detail.updateInvoice') : t('orders.detail.updateDpInvoice')}
            onAction={() => onOpenForm('dp')}
            locked={cancelled}
          />
          {!full && (cancelled && !pelunasanInvoice ? null : (
            <InvoiceTile
              label="Pelunasan"
              invoice={pelunasanInvoice}
              allInvoices={allInvoices}
              actionLabel={pelunasanInvoice ? t('orders.detail.updatePelunasanInvoice') : t('orders.detail.generatePelunasanInvoice')}
              onAction={() => onOpenForm('pelunasan')}
              locked={cancelled}
            />
          ))}
        </div>
      )}
    </section>
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
  // Cancelling keeps the order (and what was paid and spent on it) but
  // takes its unpaid invoices out of what's owed; it can be reactivated.
  const qc = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const setCancelled = useMutation({
    mutationFn: (cancel: boolean) => ordersApi.update(orderId, (cancel
      ? { cancelled_at: new Date().toISOString(), cancel_reason: cancelReason.trim() || null }
      : { cancelled_at: null }) as Parameters<typeof ordersApi.update>[1]),
    onSuccess: (_d, cancel) => {
      // The order and its invoices both changed.
      for (const key of ['orders', 'invoice', 'invoices']) qc.invalidateQueries({ queryKey: [key] })
      setCancelOpen(false)
      setCancelReason('')
      toast.success(t(cancel ? 'orders.detail.cancel.done' : 'orders.detail.cancel.reactivated'))
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  })
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
        <button onClick={() => navigate('/orders')} className="btn-secondary !px-2.5 shrink-0" title={t('orders.backToOrders')} aria-label={t('orders.backToOrders')}>
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-navy-900 leading-tight dark:text-slate-50">{order.id}</h1>
          {/* Wraps on a phone (it used to be cut off, hiding the PO number
              and the client link); one line from dock up. */}
          <p className="text-slate-500 text-xs dock:truncate dark:text-slate-400">
            {order.company} · {order.date ? format(new Date(order.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}
            {order.po_number && <> · PO <span className="font-mono">{order.po_number}</span></>}
            {order.client_id && (
              <>
                {' · '}
                <button
                  className="tap inline-flex items-center gap-1 text-navy-500 hover:underline"
                  onClick={() => navigate(`/clients/${order.client_id}`)}
                >
                  <Building2 size={11} /> {t('common.clientRecord')}
                </button>
              </>
            )}
          </p>
        </div>
        {!order.cancelled_at && (
          <button className="btn-ghost ml-auto shrink-0 !text-red-600 dark:!text-red-400" onClick={() => setCancelOpen(true)}>
            <Ban size={14} aria-hidden /> <span className="hidden sm:inline">{t('orders.detail.cancel.button')}</span><span className="sm:hidden">{t('orders.detail.cancel.buttonShort')}</span>
          </button>
        )}
      </div>

      {order.cancelled_at && (
        <div role="status" className="card p-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-slate-300 bg-slate-50 dark:bg-white/5 dark:border-navy-600">
          <Ban size={18} className="text-slate-500 shrink-0 dark:text-slate-400" aria-hidden />
          <div className="flex-1 min-w-[12rem] text-sm">
            <p className="font-semibold text-navy-900 dark:text-slate-50">{t('orders.detail.cancel.banner', { date: format(new Date(order.cancelled_at), 'd MMMM yyyy', { locale: dateLocale }) })}</p>
            <p className="text-slate-600 dark:text-slate-300">
              {order.cancel_reason ? t('orders.detail.cancel.reasonIs', { reason: order.cancel_reason }) : t('orders.detail.cancel.noReason')} {t('orders.detail.cancel.bannerEffect')}
            </p>
          </div>
          <button className="btn-secondary" disabled={setCancelled.isPending} onClick={() => setCancelled.mutate(false)}>
            <RotateCcw size={14} aria-hidden /> {t('orders.detail.cancel.reactivate')}
          </button>
        </div>
      )}

      <OrderJourney
        cancelledAt={order.cancelled_at ?? null}
        orderId={order.id}
        orderDate={order.date}
        itemCount={orderItems.length}
        dpInvoice={dpInvoice}
        pelunasanInvoice={pelunasanInvoice}
      />

      <OrderPayment
        cancelled={!!order.cancelled_at}
        orderId={order.id}
        dpInvoice={dpInvoice}
        pelunasanInvoice={pelunasanInvoice}
        allInvoices={allInvoices}
        onOpenForm={setInvoiceFormType}
      />

      <div className="card">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 flex-wrap dark:border-navy-800">
          <h2 className="font-semibold text-navy-900 dark:text-slate-50">{t('orders.detail.orderItems', { count: orderItems.length })}</h2>
          <button className="btn-primary flex items-center gap-1" onClick={openAdd}>
            <Plus size={14} /> {t('orders.detail.addItem')}
          </button>
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
                <div className="flex items-center gap-1 dock:gap-3 mt-2 -ml-2 dock:ml-0" onClick={e => e.stopPropagation()}>
                  <button
                    className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-gold-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                    onClick={() => openDuplicate(item)}
                    title={t('orders.detail.duplicateTooltip')}
                  >
                    <Copy size={12} /> {t('orders.detail.copy')}
                  </button>
                  <button
                    className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-blue-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                    onClick={() => openEdit(item)}
                    title={t('orders.detail.editTooltip')}
                  >
                    <Pencil size={12} /> {t('orders.detail.edit')}
                  </button>
                  <button
                    className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-red-500 text-sm dock:text-xs disabled:opacity-50 dark:text-slate-400"
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
                            className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-gold-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                            onClick={() => openDuplicate(item)}
                            title={t('orders.detail.duplicateTooltip')}
                          >
                            <Copy size={12} /> {t('orders.detail.copy')}
                          </button>
                          <button
                            className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-blue-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                            onClick={() => openEdit(item)}
                            title={t('orders.detail.editTooltip')}
                          >
                            <Pencil size={12} /> {t('orders.detail.edit')}
                          </button>
                          <button
                            className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-red-500 text-sm dock:text-xs disabled:opacity-50 dark:text-slate-400"
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
                              className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-gold-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                              onClick={() => openDuplicate(item)}
                              title={t('orders.detail.duplicateTooltip')}
                            >
                              <Copy size={12} /> {t('orders.detail.copy')}
                            </button>
                            <button
                              className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-blue-500 text-sm dock:text-xs flex items-center gap-1.5 dock:gap-1 dark:text-slate-400"
                              onClick={() => openEdit(item)}
                              title={t('orders.detail.editTooltip')}
                            >
                              <Pencil size={12} /> {t('orders.detail.edit')}
                            </button>
                            <button
                              className="tap px-2 dock:px-0 rounded-lg text-slate-500 hover:text-red-500 text-sm dock:text-xs disabled:opacity-50 dark:text-slate-400"
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

      {cancelOpen && (
        <Modal title={t('orders.detail.cancel.title', { id: order.id })} onClose={() => setCancelOpen(false)}>
          <div className="space-y-4">
            <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1 dark:text-slate-300">
              <li>{t('orders.detail.cancel.effectUnpaid')}</li>
              <li>{t('orders.detail.cancel.effectPaid')}</li>
              <li>{t('orders.detail.cancel.effectUndo')}</li>
            </ul>
            <FormField label={t('orders.detail.cancel.reasonLabel')}>
              <input className="field" value={cancelReason} maxLength={200} onChange={e => setCancelReason(e.target.value)} placeholder={t('orders.detail.cancel.reasonPlaceholder')} />
            </FormField>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-primary !bg-red-600 !border-red-600 hover:!bg-red-700 !text-white" disabled={setCancelled.isPending} onClick={() => setCancelled.mutate(true)}>
                <Ban size={14} aria-hidden /> {setCancelled.isPending ? t('common.saving') : t('orders.detail.cancel.confirm')}
              </button>
              <button className="btn-secondary" onClick={() => setCancelOpen(false)}>{t('orders.detail.cancel.keep')}</button>
            </div>
          </div>
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