import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Truck, Eye, RotateCcw, Printer, Building2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField } from '@/components/ui'
import { deliveryHooks, deliveryItemHooks, orderHooks, clientHooks, clientContactHooks } from '@/hooks'
import { invoicesApi } from '@/api'
import { useDateLocale } from '@/i18n/dateLocale'
import type {
  Delivery, CreateDeliveryRequest, Order, Invoice,
} from '@/types'

// ─── Delivery ─────────────────────────────────────────────────────────────────

// Delivery IDs follow "NN/KMA/DO/YY" or "NN/KMA/SJ/YY" (e.g. "01/KMA/DO/26").
// DO and SJ each keep their own sequence — mirrors suggestNextOrderId in
// OrdersPage.tsx, restarting at 01 each year and per type.
function suggestNextDeliveryId(deliveries: Delivery[], type: 'DO' | 'SJ'): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KMA\\/${type}\\/${yy}$`)
  const usedNumbers = deliveries
    .map(d => d.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(2, '0')}/KMA/${type}/${yy}`
}

// The documents an SJ for an order carries: a kwitansi and an invoice per
// invoice raised (DP or PELUNASAN), plus COPY PO if the order has a PO.
function suggestSJDocuments(order: Order | undefined, orderInvoices: Invoice[]): { item_name: string; amount: number }[] {
  if (!order) return []
  const docs: { item_name: string; amount: number }[] = []
  orderInvoices.forEach(inv => {
    // A 0% DP is a full invoice, labelled PELUNASAN.
    const isFullInvoice = inv.type === 'dp' && (inv.down_payment ?? 0) === 0
    const suffix = inv.type === 'pelunasan' || isFullInvoice ? ' (PELUNASAN)' : ' (DP)'
    docs.push({ item_name: `ASLI KWITANSI NO. ${inv.id}`, amount: 1 })
    docs.push({ item_name: `ASLI INVOICE NO. ${inv.id}${suffix}`, amount: 1 })
  })
  if (order.po_number) {
    docs.push({ item_name: 'COPY PO', amount: 1 })
  }
  return docs
}

function DeliveryForm({ editing, onClose }: { editing: Delivery | null; onClose: () => void }) {
  const { t } = useTranslation()
  const create = deliveryHooks.useCreate()
  const update = deliveryHooks.useUpdate()
  const createItem = deliveryItemHooks.useCreate()
  const navigate = useNavigate() 
  // If this list failed to load, the duplicate-ID check and the suggested number
  // can't be trusted; the form says so.
  const { data: deliveries = [], isError: isDeliveriesError } = deliveryHooks.useList()
  const { data: orders = [] } = orderHooks.useList()
  const { data: clients = [] } = clientHooks.useList()
  // The order's invoices, for the SJ document list.
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list(),
  })

  const [type, setType] = useState<'DO' | 'SJ'>(
    editing?.id?.includes('/SJ/') ? 'SJ' : 'DO'
  )

  // Only auto-fill/auto-refresh the ID while the user hasn't typed their
  // own value — same rule as OrdersPage's idTouched, so we never clobber a
  // manually-entered ID.
  const [idTouched, setIdTouched] = useState(false)

  // Company and PO follow the picked order until typed by hand. Editing starts
  // "touched" so saved values are kept.
  const [companyTouched, setCompanyTouched] = useState(!!editing)
  const [poNumberTouched, setPoNumberTouched] = useState(!!editing)
  // Client too: an order's client fills it unless one was picked by hand.
  const [clientTouched, setClientTouched] = useState(!!editing)

  const [form, setForm] = useState<CreateDeliveryRequest>({
    id:                editing?.id                ?? '', 
    type:              editing?.type               ?? type,
    client_id:         editing?.client_id          ?? null,
    client_contact_id: editing?.client_contact_id  ?? null,
    company:           editing?.company            ?? '',
    address:           editing?.address            ?? '',
    po_number:         editing?.po_number          ?? '',
    phone_number:      editing?.phone_number       ?? '',
    contact_person:    editing?.contact_person     ?? '',
    date:              editing?.date ? editing.date.split('T')[0] : '',
    // Only DO deliveries are tied to an order — a DO's box contents come
    // from that order's Items, capped by what's left to deliver. SJ
    // deliveries (documents) aren't order-item-constrained.
    order_id:          editing?.order_id           ?? null,
  })

  // This client's contacts, for the optional Contact picker below — only
  // fetched once a client is actually linked, same "enabled" gating as
  // ClientDetailPage's POC list.
  const { data: contacts = [] } = clientContactHooks.useByClient(form.client_id ?? undefined)

  // For both the DO and SJ order selects: fill the untouched fields from the order.
  const applyOrderSelection = (newOrderId: string | null) => {
    const selectedOrder = orders.find(o => o.id === newOrderId)
    setForm(p => {
      const newClientId = !clientTouched ? (selectedOrder?.client_id ?? p.client_id) : p.client_id
      return {
        ...p,
        order_id: newOrderId,
        company: !companyTouched && selectedOrder?.company ? selectedOrder.company.toUpperCase() : p.company,
        po_number: !poNumberTouched && selectedOrder?.po_number ? selectedOrder.po_number.toUpperCase() : p.po_number,
        client_id: newClientId,
        // A contact belongs to one specific client — if the order swap
        // changed which client we're linked to, any previously-picked
        // contact no longer applies.
        client_contact_id: newClientId !== p.client_id ? null : p.client_contact_id,
      }
    })
  }

  // Picking a client fills Company (unless typed) and clears the old contact.
  const handleClientChange = (idStr: string) => {
    setClientTouched(true)
    const newClientId = idStr ? Number(idStr) : null
    const newClient = clients.find(c => c.id === newClientId)
    setForm(p => ({
      ...p,
      client_id: newClientId,
      client_contact_id: null,
      company: !companyTouched && newClient ? newClient.client_name : p.company,
    }))
  }

  // Picking a contact fills Contact Person, Phone and Address; values the contact
  // doesn't have are kept.
  const handleContactChange = (idStr: string) => {
    const newContactId = idStr ? Number(idStr) : null
    const contact = contacts.find(c => c.id === newContactId)
    setForm(p => ({
      ...p,
      client_contact_id: newContactId,
      contact_person: contact ? contact.name : p.contact_person,
      phone_number: contact?.phone_number ? contact.phone_number : p.phone_number,
      address: contact?.address ? contact.address.toUpperCase() : p.address,
    }))
  }

  // Prefill the suggested ID for brand-new deliveries once the list is
  // available, and re-suggest whenever the type toggle changes (DO and SJ
  // have separate sequences) — as long as the user hasn't typed their own.
  useEffect(() => {
    if (!editing && !idTouched) {
      setForm(p => ({ ...p, id: suggestNextDeliveryId(deliveries, type) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, editing, type])

  const resetIdSuggestion = () => {
    setIdTouched(false)
    setForm(p => ({ ...p, id: suggestNextDeliveryId(deliveries, type) }))
  }

  const idAlreadyExists = deliveries.some(d => d.id === form.id && d.id !== editing?.id)

  // For the plain fields (Date, Phone); the text fields use UppercaseField.
  const setStr = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [k]: e.target.value }))
  }

  const setCompany = (value: string) => { setCompanyTouched(true); setForm(p => ({ ...p, company: value })) }
  const setPoNumber = (value: string) => { setPoNumberTouched(true); setForm(p => ({ ...p, po_number: value })) }
  const setAddress = (value: string) => setForm(p => ({ ...p, address: value }))
  const setContactPerson = (value: string) => setForm(p => ({ ...p, contact_person: value }))

  const idPlaceholder = type === 'DO' ? '01/KMA/DO/26' : '01/KMA/SJ/26'

  const handleSubmit = () => {
      if (!form.id.trim()) return
      if (idAlreadyExists) return
      if (type === 'DO' && !form.order_id) return
      if (!form.company?.trim()) return
      const payload = {
        ...form,
        id: form.id.trim(),
        date: form.date ? new Date(form.date).toISOString() : new Date().toISOString()
      }
      if (editing) {
        update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
      } else {
        create.mutate(payload, {
          onSuccess: async (newDelivery) => {
            if (type === 'SJ' && form.order_id) {
              const linkedOrder = orders.find(o => o.id === form.order_id)
              const orderInvoices = invoices.filter(inv => inv.order_id === form.order_id)
              const docs = suggestSJDocuments(linkedOrder, orderInvoices)
              let added = 0
              try {
                // One at a time, so the documents keep their Kwitansi → Invoice → PO order.
                for (const doc of docs) {
                  await createItem.mutateAsync({
                    delivery_id: newDelivery.id,
                    item_name: doc.item_name,
                    size: null,
                    amount: doc.amount,
                    box_number: 1,
                  })
                  added++
                }
              } catch {
                toast.error(`Only added ${added} of ${docs.length} documents to ${newDelivery.id} — add the rest from its page.`)
              }
            }
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
        <FormField label={t('delivery.form.deliveryType')} required>
          <select className="field" value={type} onChange={e => {
            const newType = e.target.value as 'DO' | 'SJ'
            setType(newType)
            setForm(p => ({ ...p, type: newType, order_id: newType === 'SJ' ? null : p.order_id }))
          }}>
            <option value="DO">{t('delivery.form.doOption')}</option>
            <option value="SJ">{t('delivery.form.sjOption')}</option>
          </select>
        </FormField>
      )}

      {type === 'DO' && (
        <FormField label={t('delivery.form.order')} required>
          <select
            className="field"
            value={form.order_id ?? ''}
            onChange={e => applyOrderSelection(e.target.value || null)}
          >
            <option value="">{t('delivery.form.selectOrder')}</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
            {t('delivery.form.doOrderHint')}
          </p>
        </FormField>
      )}

      {type === 'SJ' && (
        <FormField label={t('delivery.form.orderOptional')}>
          <select
            className="field"
            value={form.order_id ?? ''}
            onChange={e => applyOrderSelection(e.target.value || null)}
          >
            <option value="">{t('delivery.form.noLinkedOrder')}</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
          </select>
          {form.order_id ? (() => {
            const linkedOrder = orders.find(o => o.id === form.order_id)
            const orderInvoices = invoices.filter(inv => inv.order_id === form.order_id)
            const preview = suggestSJDocuments(linkedOrder, orderInvoices)
            return preview.length > 0 ? (
              <div className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 dark:text-slate-400 dark:bg-navy-950 dark:border-navy-700">
                {t('delivery.form.willAutoAdd')}
                <ul className="mt-1 space-y-0.5">
                  {preview.map(doc => <li key={doc.item_name} className="font-mono">· {doc.item_name}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-600 mt-1 dark:text-amber-400">
                {t('delivery.form.noInvoicesNoAutoAdd')}
              </p>
            )
          })() : (
            <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
              {t('delivery.form.sjOrderHint')}
            </p>
          )}
        </FormField>
      )}

      <FormField label={type === 'DO' ? t('delivery.form.doNumber') : t('delivery.form.sjNumber')} required>
        <div className="flex items-center gap-2">
          <UppercaseField
            className="field font-mono"
            placeholder={`e.g. ${idPlaceholder}`}
            readOnly={!!editing}
            value={form.id}
            onChange={v => { setIdTouched(true); setForm(p => ({ ...p, id: v })) }}
          />
          {!editing && (
            <button
              type="button"
              className="btn-ghost btn-sm !px-2 shrink-0"
              title={t('delivery.form.resetIdTitle')}
              onClick={resetIdSuggestion}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        {isDeliveriesError ? (
          <p className="text-xs text-amber-600 mt-1 dark:text-amber-400">
            {t('delivery.form.idUnverified')}
          </p>
        ) : idAlreadyExists ? (
          <p className="text-xs text-red-500 mt-1">
            {t('delivery.form.idExists')}
          </p>
        ) : !editing ? (
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
            {t('delivery.form.idSuggested', { type, year: new Date().getFullYear() })}
          </p>
        ) : null}
      </FormField>

      <FormField label={t('delivery.form.client')}>
        <select className="field" value={form.client_id ?? ''} onChange={e => handleClientChange(e.target.value)}>
          <option value="">{t('delivery.form.noLinkedClient')}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
          {form.order_id
            ? t('delivery.form.clientHintFromOrder')
            : t('delivery.form.clientHint')}
        </p>
      </FormField>

      {form.client_id && contacts.length > 0 && (
        <FormField label={t('delivery.form.contactOptional')}>
          <select className="field" value={form.client_contact_id ?? ''} onChange={e => handleContactChange(e.target.value)}>
            <option value="">{t('delivery.form.noSpecificContact')}</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.role ? ` — ${c.role}` : ''}{c.is_primary ? ` (${t('delivery.form.primary')})` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
            {t('delivery.form.contactHint')}
          </p>
        </FormField>
      )}

      <FormField label={t('delivery.form.companyLabel')} required>
        <UppercaseField className="field" placeholder={t('delivery.form.companyPlaceholder')}
          value={form.company ?? ''} onChange={setCompany} />
      </FormField>

      <FormField label={t('delivery.form.address')} required>
        <UppercaseField className="field" placeholder={t('delivery.form.addressPlaceholder')}
          value={form.address} onChange={setAddress} />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {type === 'DO' && (
          <FormField label={t('delivery.form.poNumber')}>
            <UppercaseField className="field font-mono" placeholder="P0000011"
              value={form.po_number ?? ''} onChange={setPoNumber} />
          </FormField>
        )}
        <FormField label={t('delivery.form.deliveryDate')}>
          <input className="field" type="date"
            value={form.date} onChange={setStr('date')} />
        </FormField>
        <FormField label={t('delivery.form.contactPerson')}>
          <UppercaseField className="field" placeholder={t('delivery.form.contactPersonPlaceholder')}
            value={form.contact_person ?? ''} onChange={setContactPerson} />
        </FormField>
        <FormField label={t('delivery.form.phoneNumber')}>
          <input className="field font-mono" placeholder="081219201007"
            value={form.phone_number ?? ''} onChange={setStr('phone_number')} />
        </FormField>
      </div>

      {/* Context note based on type */}
      <div className={`rounded-lg px-4 py-3 text-xs ${
        type === 'DO'
          ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
          : 'bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
      }`}>
        {type === 'DO'
          ? t('delivery.form.doNoteAfterCreate')
          : t('delivery.form.sjNoteAfterCreate')}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          className="btn-primary"
          disabled={busy || idAlreadyExists || !form.id.trim() || !form.address?.trim() || !form.company?.trim() || (type === 'DO' && !form.order_id)}
          onClick={handleSubmit}
        >
          {busy ? t('common.saving') : editing ? t('delivery.form.updateDelivery') : (type === 'DO' ? t('delivery.form.createDeliveryOrder') : t('delivery.form.createSuratJalan'))}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

export function DeliveryPage() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const { data, isLoading, isError, refetch } = deliveryHooks.useList()
  const del = deliveryHooks.useDelete()
  const navigate = useNavigate()

  return (
    <CrudPage<Delivery>
      title={t('delivery.title')}
      icon={Truck}
      data={data}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['company', 'address', 'contact_person', 'po_number']}
      columns={[
        { header: t('delivery.columns.deliveryId'),     key: 'id',             render: r => <span className="id-chip">{r.id}</span> },
        { header: t('delivery.columns.company'),         key: 'company',        render: r => <span className="font-semibold text-navy-900 dark:text-slate-50">{r.company ?? '—'}</span> },
        { header: t('delivery.columns.client'),          key: 'client_id',      secondary: true, render: r => r.client_id ? (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/clients/${r.client_id}`) }}
              className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-800"
              title={t('delivery.viewClientRecord')}
            >
              <Building2 size={12} /> {t('common.view')} <ArrowRight size={12} />
            </button>
          ) : <span className="text-slate-300 text-xs dark:text-navy-700">{t('delivery.notLinked')}</span> },
        { header: t('delivery.columns.address'),         key: 'address',        render: r => <span className="font-medium">{r.address}</span> },
        { header: t('delivery.columns.contact'),         key: 'contact_person', secondary: true, render: r => r.contact_person || r.phone_number ? (
            <div className="leading-tight">
              {r.contact_person && <div>{r.contact_person}</div>}
              {r.phone_number && <div className="font-mono text-xs text-slate-400 dark:text-slate-500">{r.phone_number}</div>}
            </div>
          ) : '—' },
        { header: t('delivery.columns.po'),              key: 'po_number',      secondary: true, render: r => <span className="font-mono text-xs">{r.po_number ?? '—'}</span> },
        { header: t('delivery.columns.date'),            key: 'date',           render: r => r.date ? <span className="whitespace-nowrap">{format(new Date(r.date), 'dd MMM yyyy', { locale: dateLocale })}</span> : '—' },
      ]}
      formTitle={e => e ? t('delivery.formTitleEdit') : t('delivery.formTitleNew')}
      renderForm={(editing, onClose) => <DeliveryForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => t('delivery.deleteConfirm', { id: r.id })}
      rowActions={row => (
        <>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/delivery/${encodeURIComponent(row.id)}`)}
            title={t('delivery.viewContents')}>
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/delivery/${encodeURIComponent(row.id)}/print`)}
            title={t('delivery.printDeliveryOrder')}>
            <Printer className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    />
  )
}