import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Eye, Plus, RotateCcw, Printer, Building2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField } from '@/components/ui'
import { deliveryHooks, deliveryItemHooks, orderHooks, clientHooks, clientContactHooks } from '@/hooks'
import { invoicesApi } from '@/api'
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

// For an SJ tied to an order, the documents that physically go out are
// derived, not typed: an original kwitansi + invoice per invoice raised
// against that order (labelled DP or PELUNASAN depending on whether it's
// been paid off), plus a "COPY PO" line if the order has a PO number.
// Mirrors the paper template — see the physical SJ example this was built
// from, which lists exactly these three document types under ITEMS.
function suggestSJDocuments(order: Order | undefined, orderInvoices: Invoice[]): { item_name: string; amount: number }[] {
  if (!order) return []
  const docs: { item_name: string; amount: number }[] = []
  orderInvoices.forEach(inv => {
    // Same "0% DP = full invoice, not a partial one" convention as
    // OrderDetailPage/InvoiceListPage/InvoicePrintPage/KwitansiPrintPage —
    // a dp-type invoice with nothing actually down reads as Pelunasan here
    // too. (Previously checked `inv.remaining === 0`, which is never true:
    // `remaining` is the amount THIS invoice bills for, not what's left
    // after it — so Pelunasan invoices were printing with no suffix at all.)
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
  const create = deliveryHooks.useCreate()
  const update = deliveryHooks.useUpdate()
  const createItem = deliveryItemHooks.useCreate()
  const navigate = useNavigate() 
  const { data: deliveries = [] } = deliveryHooks.useList()
  const { data: orders = [] } = orderHooks.useList()
  const { data: clients = [] } = clientHooks.useList()
  // Only needed to build the SJ auto-documents preview/creation below — a
  // plain fetch here (like DeliveryPrintPage does for delivery/items)
  // rather than a dedicated hook, since this is the only place in the app
  // that needs invoices scoped to an order.
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

  // Same "touched" convention for the two fields the selected Order can
  // supply (Company, PO Number): as long as the user hasn't typed into
  // them directly, picking an order — or switching to a different one —
  // keeps them in sync with that order's data. Editing an existing
  // delivery starts touched=true so opening the edit modal never
  // overwrites what's already saved.
  const [companyTouched, setCompanyTouched] = useState(!!editing)
  const [poNumberTouched, setPoNumberTouched] = useState(!!editing)
  // Same idea for Client — picking an Order that's itself linked to a
  // Client fills this in for free; picking a Client directly (or editing
  // an existing delivery) marks it touched so linking/switching an order
  // never silently overwrites a deliberately-chosen client.
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

  // Shared by both the DO "Order" select and the SJ "Order (optional)"
  // select — picking an order fills Company/PO Number/Client from it
  // wherever those fields haven't been touched directly, same rule
  // uniformly applied in one place instead of duplicated per-type.
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

  // Picking a client prefills Company from client_name — same convention
  // as OrdersPage — but only when Company hasn't been touched directly.
  // Any previously-picked contact is cleared, since it belonged to the
  // old client.
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

  // Picking a contact fills Contact Person / Phone Number from it — same
  // "touched" idea as everything else here, so it never clobbers a value
  // you've already typed by hand.
  const handleContactChange = (idStr: string) => {
    const newContactId = idStr ? Number(idStr) : null
    const contact = contacts.find(c => c.id === newContactId)
    setForm(p => ({
      ...p,
      client_contact_id: newContactId,
      contact_person: contact ? contact.name : p.contact_person,
      phone_number: contact?.phone_number ? contact.phone_number : p.phone_number,
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

  // Same convention as OrdersPage — Address/PO Number/Contact Person/
  // Company uppercase as-typed via UppercaseField directly now, so
  // "jl. hayam wuruk" / "Jl. Hayam Wuruk" / "JL. HAYAM WURUK" don't end up
  // as three different-looking values across deliveries. Phone number is
  // left alone since it's digits only. setStr now only handles the two
  // remaining plain fields (Date, Phone Number).
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
            onClose()
            if (type === 'SJ' && form.order_id) {
              const linkedOrder = orders.find(o => o.id === form.order_id)
              const orderInvoices = invoices.filter(inv => inv.order_id === form.order_id)
              // Sequential, not a forEach of .mutate() calls — those fire
              // concurrently and land in whatever order the network happens
              // to resolve them, which scrambles the intended
              // Kwitansi → Invoice → PO sequence on the printout.
              for (const doc of suggestSJDocuments(linkedOrder, orderInvoices)) {
                await createItem.mutateAsync({
                  delivery_id: newDelivery.id,
                  item_name: doc.item_name,
                  size: null,
                  amount: doc.amount,
                  box_number: 1,
                })
              }
            }
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
          <select className="field" value={type} onChange={e => {
            const t = e.target.value as 'DO' | 'SJ'
            setType(t)
            setForm(p => ({ ...p, type: t, order_id: t === 'SJ' ? null : p.order_id }))
          }}>
            <option value="DO">DO — Delivery Order (item delivery, per box)</option>
            <option value="SJ">SJ — Surat Jalan (documents: mock ups, invoices, receipts)</option>
          </select>
        </FormField>
      )}

      {type === 'DO' && (
        <FormField label="Order" required>
          <select
            className="field"
            value={form.order_id ?? ''}
            onChange={e => applyOrderSelection(e.target.value || null)}
          >
            <option value="">Select order…</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Box contents can only be picked from this order's items, up to what's left to deliver.
            Company, PO Number, and Client below fill in from the order — edit them directly if this delivery needs different values.
          </p>
        </FormField>
      )}

      {type === 'SJ' && (
        <FormField label="Order (optional)">
          <select
            className="field"
            value={form.order_id ?? ''}
            onChange={e => applyOrderSelection(e.target.value || null)}
          >
            <option value="">No linked order…</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
          </select>
          {form.order_id ? (() => {
            const linkedOrder = orders.find(o => o.id === form.order_id)
            const orderInvoices = invoices.filter(inv => inv.order_id === form.order_id)
            const preview = suggestSJDocuments(linkedOrder, orderInvoices)
            return preview.length > 0 ? (
              <div className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Will auto-add on create:
                <ul className="mt-1 space-y-0.5">
                  {preview.map(doc => <li key={doc.item_name} className="font-mono">· {doc.item_name}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-600 mt-1">
                No invoices found yet for this order, and it has no PO number — nothing will be auto-added.
              </p>
            )
          })() : (
            <p className="text-xs text-slate-400 mt-1">
              Linking an order auto-adds its kwitansi, invoice, and PO copy as documents once created.
            </p>
          )}
        </FormField>
      )}

      <FormField label={type === 'DO' ? 'Delivery Order No.' : 'Surat Jalan No.'} required>
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
              title="Reset to suggested next number"
              onClick={resetIdSuggestion}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        {idAlreadyExists ? (
          <p className="text-xs text-red-500 mt-1">
            A delivery with this ID already exists — pick a different number.
          </p>
        ) : !editing ? (
          <p className="text-xs text-slate-400 mt-1">
            Auto-suggested as next {type} number for {new Date().getFullYear()} — edit if needed.
          </p>
        ) : null}
      </FormField>

      <FormField label="Client">
        <select className="field" value={form.client_id ?? ''} onChange={e => handleClientChange(e.target.value)}>
          <option value="">No linked client (free-text company only)…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          {form.order_id
            ? "Filled in from the linked order above — change it here if this delivery's client differs."
            : 'Linking a client ties this delivery to their record in Clients.'}
        </p>
      </FormField>

      {form.client_id && contacts.length > 0 && (
        <FormField label="Contact (optional)">
          <select className="field" value={form.client_contact_id ?? ''} onChange={e => handleContactChange(e.target.value)}>
            <option value="">No specific contact…</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.role ? ` — ${c.role}` : ''}{c.is_primary ? ' (Primary)' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Fills in Contact Person and Phone Number below — still editable, or leave unpicked to type them directly.
          </p>
        </FormField>
      )}

      <FormField label="Company (NAMA)" required>
        <UppercaseField className="field" placeholder="e.g. The 101 Darmawangsa"
          value={form.company ?? ''} onChange={setCompany} />
      </FormField>

      <FormField label="Delivery Address" required>
        <UppercaseField className="field" placeholder="e.g. Jl. Hayam Wuruk No. 1"
          value={form.address} onChange={setAddress} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        {type === 'DO' && (
          <FormField label="PO Number">
            <UppercaseField className="field font-mono" placeholder="P0000011"
              value={form.po_number ?? ''} onChange={setPoNumber} />
          </FormField>
        )}
        <FormField label="Delivery Date">
          <input className="field" type="date"
            value={form.date} onChange={setStr('date')} />
        </FormField>
        <FormField label="Contact Person">
          <UppercaseField className="field" placeholder="e.g. Ibu Tuti"
            value={form.contact_person ?? ''} onChange={setContactPerson} />
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
        <button
          className="btn-primary"
          disabled={busy || idAlreadyExists || !form.id.trim() || !form.address?.trim() || !form.company?.trim() || (type === 'DO' && !form.order_id)}
          onClick={handleSubmit}
        >
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
      searchKeys={['company', 'address', 'contact_person', 'po_number']}
      columns={[
        { header: 'Delivery ID',     key: 'id',             render: r => <span className="id-chip">{r.id}</span> },
        { header: 'Company',         key: 'company',        render: r => <span className="font-semibold text-navy-900">{r.company ?? '—'}</span> },
        { header: 'Client',          key: 'client_id',      render: r => r.client_id ? (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/clients/${r.client_id}`) }}
              className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-800"
              title="Open client record"
            >
              <Building2 size={12} /> View <ArrowRight size={12} />
            </button>
          ) : <span className="text-slate-300 text-xs">Not linked</span> },
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
        <>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/delivery/${encodeURIComponent(row.id)}`)}
            title="View contents">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/delivery/${encodeURIComponent(row.id)}/print`)}
            title="Print delivery order">
            <Printer className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    />
  )
}