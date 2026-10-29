import { useState, useEffect, useMemo } from 'react'
import { ShoppingBag, Eye, RotateCcw, Building2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField, formatRp } from '@/components/ui'
import { orderPaymentStatus } from '@/utils/orderStatus'
import { orderHooks, clientHooks, itemHooks, invoiceHooks } from '@/hooks'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Order, CreateOrderRequest } from '@/types'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api'

// ─── ID auto-numbering ────────────────────────────────────────────────────
// Order IDs are "NNN/KMA/YY", numbered from 001 each year.
function suggestNextOrderId(orders: Order[]): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KMA\\/${yy}$`)
  const usedNumbers = orders
    .map(o => o.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(3, '0')}/KMA/${yy}`
}

function OrderForm({ editing, onClose }: { editing: Order | null; onClose: () => void }) {
  const { t } = useTranslation()
  const create = orderHooks.useCreate()
  const update = orderHooks.useUpdate()
  const navigate = useNavigate()
  const { data: orders = [], refetch: refetchOrders } = orderHooks.useList()
  const { data: clients = [] } = clientHooks.useList()

  // Only auto-fill/auto-refresh the ID while the user hasn't typed their
  // own value into that field — once they touch it, we back off completely
  // so we never clobber a manually-entered ID (e.g. a corrected number).
  const [idTouched, setIdTouched] = useState(false)

  const [form, setForm] = useState<CreateOrderRequest>({
    id :        editing?.id ?? '',
    client_id:  editing?.client_id ?? null,
    company:    editing?.company   ?? '',
    po_number:  editing?.po_number ?? '',
    // Default new orders to today — almost always correct, and still
    // fully editable if the order was actually placed on another date.
    date:       editing?.date ? editing.date.split('T')[0] : new Date().toISOString().split('T')[0],
  })

  // Picking a client fills Company, unless it was typed by hand.
  const handleClientChange = (idStr: string) => {
    const newClientId = idStr ? Number(idStr) : null
    const newClient = clients.find(c => c.id === newClientId)
    const prevClient = clients.find(c => c.id === form.client_id)
    setForm(p => {
      const companyMatchesPrevClient = !p.company || (prevClient && p.company === prevClient.client_name)
      return {
        ...p,
        client_id: newClientId,
        company: newClient && companyMatchesPrevClient ? newClient.client_name : p.company,
      }
    })
  }

  // Suggest the next ID once orders load, until the user types one.
  useEffect(() => {
    if (!editing && !idTouched) {
      setForm(p => ({ ...p, id: suggestNextOrderId(orders) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, editing])

  // For the plain fields (Date); the codes use UppercaseField.
  const set = (k: keyof CreateOrderRequest) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
  }

  const setId = (value: string) => {
    setIdTouched(true)
    setForm(prev => ({ ...prev, id: value }))
  }

  // Refetch first: after a 409 the cached list may not have the order that took it.
  const resetIdSuggestion = async () => {
    setIdTouched(false)
    const { data: freshOrders } = await refetchOrders()
    setForm(p => ({ ...p, id: suggestNextOrderId(freshOrders ?? orders) }))
  }

  const idAlreadyExists = orders.some(o => o.id === form.id && o.id !== editing?.id)
  const idChanged = !!editing && form.id !== editing.id

  const handleSubmit = () => {
    if (!form.id.trim()) return
    if (!form.company?.trim()) return
    if (idAlreadyExists) return

    const payload = {
      ...form,
      id: form.id.trim(),
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
    }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, {
        onSuccess: (newOrder) => {
          onClose()
          navigate(`/orders/${encodeURIComponent(newOrder.id)}`)
        },
        onError: (err) => {
          // Someone else took this ID first: say so and offer the next free one.
          if (err instanceof ApiError && err.status === 409) {
            toast.error(t('orders.idTakenRetry'))
            resetIdSuggestion()
            return
          }
          toast.error(t('orders.createFailed'))
        },
      })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label={t('orders.id')} required>
        <div className="flex items-center gap-2">
          <UppercaseField
            className="field font-mono"
            placeholder={t('orders.idPlaceholder')}
            value={form.id ?? ''}
            onChange={setId}
          />
          {!editing && (
            <button
              type="button"
              className="btn-ghost btn-sm !px-2 shrink-0"
              title={t('orders.resetIdTitle')}
              onClick={resetIdSuggestion}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        {idAlreadyExists ? (
          <p className="text-xs text-red-500 mt-1 dark:text-red-400">
            {t('orders.idExists')}
          </p>
        ) : idChanged ? (
          <p className="text-xs text-amber-600 mt-1 dark:text-amber-400">
            {t('orders.idRenaming', { id: editing!.id })}
          </p>
        ) : !editing ? (
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
            {t('orders.idSuggested', { year: new Date().getFullYear() })}
          </p>
        ) : null}
      </FormField>
      <FormField label={t('orders.client')}>
        <select className="field" value={form.client_id ?? ''} onChange={e => handleClientChange(e.target.value)}>
          <option value="">{t('orders.noLinkedClient')}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
          {t('orders.clientHint')}
        </p>
      </FormField>
      <FormField label={t('orders.company')} required>
        <UppercaseField className="field" placeholder={t('orders.companyPlaceholder')} value={form.company ?? ''}
          onChange={v => setForm(p => ({ ...p, company: v }))} />
      </FormField>
      <FormField label={t('orders.poNumber')}>
        <UppercaseField className="field font-mono" placeholder={t('orders.poPlaceholder')} value={form.po_number ?? ''}
          onChange={v => setForm(p => ({ ...p, po_number: v }))} />
      </FormField>
      <FormField label={t('orders.orderDate')} required>
        <input className="field" type="date" value={form.date} onChange={set('date')} />
      </FormField>
      <div className="flex gap-2 pt-2">
        <button
          className="btn-primary"
          disabled={busy || idAlreadyExists || !form.id.trim() || !form.company?.trim()}
          onClick={handleSubmit}
        >
          {busy ? t('common.saving') : editing ? t('orders.updateOrder') : t('orders.createOrder')}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const { data, isLoading, isError, refetch } = orderHooks.useList()
  const { data: items = [] } = itemHooks.useList()
  const { data: invoices = [] } = invoiceHooks.useList()
  const del = orderHooks.useDelete()
  const update = orderHooks.useUpdate()
  const navigate = useNavigate()
  // Newest first, with each order's value and where its payment stands.
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id)), [data])
  const value = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.order_id, (m.get(it.order_id) ?? 0) + it.sub_total)
    return m
  }, [items])

  return (
    <CrudPage<Order>
      title={t('orders.title')}
      icon={ShoppingBag}
      data={rows}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['company', 'po_number']}
      columns={[
        { header: t('orders.columns.orderId'),  key: 'id',         render: r => <span className="id-chip">{r.id}</span> },
        { header: t('orders.columns.company'),   key: 'company',     edit: { type: 'text', uppercase: true }, render: r => <span className="font-medium text-navy-900 dark:text-slate-50">{r.company ?? '—'}</span> },
        { header: t('orders.columns.client'),    key: 'client_id',   secondary: true, render: r => r.client_id ? (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/clients/${r.client_id}`) }}
              className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-800"
              title={t('orders.viewClientRecord')}
            >
              <Building2 size={12} /> {t('common.view')} <ArrowRight size={12} />
            </button>
          ) : <span className="text-slate-500 text-xs dark:text-navy-300">{t('orders.notLinked')}</span> },
        { header: t('orders.columns.poNumber'), key: 'po_number',   secondary: true, edit: { type: 'text', uppercase: true, value: r => r.po_number ?? '' }, render: r => <span className="font-mono text-xs">{r.po_number ?? '—'}</span> },
        { header: t('orders.columns.date'),      key: 'date',        edit: { type: 'date', value: r => r.date ? r.date.slice(0, 10) : '' }, render: r => r.date ? <span className="whitespace-nowrap">{format(new Date(r.date), 'dd MMM yyyy', { locale: dateLocale })}</span> : '—' },
        { header: t('orders.columns.value'),     key: 'value', render: r => value.get(r.id) ? <span className="font-mono tabular-nums whitespace-nowrap">{formatRp(value.get(r.id)!)}</span> : <span className="text-slate-500 text-xs dark:text-navy-300">{t('orders.noItems')}</span> },
        { header: t('orders.columns.payment'),   key: 'payment', render: r => {
            const st = orderPaymentStatus(r.id, invoices)
            return <span className={`badge ${st.className}`}>{st.label}</span>
          } },
      ]}
      formTitle={e => e ? t('orders.formTitleEdit') : t('orders.formTitleNew')}
      renderForm={(editing, onClose) => <OrderForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => t('orders.deleteConfirm', { id: r.id })}
      rowActions={row => (
        <button
          className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
          onClick={() => navigate(`/orders/${encodeURIComponent(row.id)}`)}
          title={t('orders.viewItems')}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
      onCellEdit={(row, key, value) => {
        if (key === 'company' && !String(value ?? '').trim()) { toast.error(t('orders.companyRequired')); return }
        if (key === 'date') {
          const d = String(value ?? '').trim()
          if (!d || Number.isNaN(new Date(d).getTime())) { toast.error(t('orders.dateRequired')); return }
          update.mutate({ id: row.id, body: { date: new Date(d).toISOString() } })
          return
        }
        update.mutate({ id: row.id, body: { [key]: value || null } as Partial<CreateOrderRequest> })
      }}
    />
  )
}