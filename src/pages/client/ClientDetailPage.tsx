import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, Users, Package, Printer, Image as ImageIcon } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, Spinner, UppercaseField } from '@/components/ui'
import { clientHooks, clientContactHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import { ClientPriceListPrint } from './ClientPriceListPrint'
import type {
  ClientContact, CreateClientContactRequest,
  ClientItem, CreateClientItemRequest, ClientItemPrice,
} from '@/types'

function ClientContactForm({ clientId, editing, onClose }: { clientId: number; editing: ClientContact | null; onClose: () => void }) {
  const create = clientContactHooks.useCreate()
  const update = clientContactHooks.useUpdate()

  const [form, setForm] = useState<CreateClientContactRequest>({
    client_id:      clientId,
    name:           editing?.name           ?? '',
    role:           editing?.role           ?? null,
    phone_number:   editing?.phone_number   ?? null,
    email:          editing?.email          ?? null,
    location_label: editing?.location_label ?? null,
    address:        editing?.address        ?? null,
    is_primary:     editing?.is_primary     ?? false,
  })

  const handleSubmit = () => {
    if (editing) {
      update.mutate({ id: editing.id, body: form }, { onSuccess: onClose })
    } else {
      create.mutate(form, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Name" required>
        <UppercaseField className="field" placeholder="e.g. Budi Santoso" value={form.name}
          onChange={v => setForm(p => ({ ...p, name: v }))} />
      </FormField>
      <FormField label="Role">
        <UppercaseField className="field" placeholder="e.g. Purchasing Manager" value={form.role ?? ''}
          onChange={v => setForm(p => ({ ...p, role: v || null }))} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Phone">
          <input className="field" value={form.phone_number ?? ''}
            onChange={e => setForm(p => ({ ...p, phone_number: e.target.value || null }))} />
        </FormField>
        <FormField label="Email">
          <input className="field" type="email" value={form.email ?? ''}
            onChange={e => setForm(p => ({ ...p, email: e.target.value || null }))} />
        </FormField>
      </div>
      <FormField label="Location Label">
        <UppercaseField className="field" placeholder="e.g. Head Office, Gudang Cikarang" value={form.location_label ?? ''}
          onChange={v => setForm(p => ({ ...p, location_label: v || null }))} />
      </FormField>
      <FormField label="Address">
        <UppercaseField as="textarea" className="field resize-none" rows={2} value={form.address ?? ''}
          onChange={v => setForm(p => ({ ...p, address: v || null }))} />
      </FormField>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={form.is_primary}
          onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))} />
        Primary contact
      </label>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Contact' : 'Add Contact'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// Was an inline upload/replace/remove control (see git history / the old
// ClientItemPhotoCell) — that's all moved to ClientItemDetailPage now,
// which has room for a real photo panel instead of a 36px table cell.
// This cell is just a doorway into that page: click the thumbnail (or the
// placeholder icon, if there's no photo yet) to open the item's full
// info + price history.
function ClientItemPhotoCell({ item, clientId }: { item: ClientItem; clientId: number }) {
  const navigate = useNavigate()
  const [imgFailed, setImgFailed] = useState(false)
  const go = (e: React.MouseEvent) => { e.stopPropagation(); navigate(`/clients/${clientId}/items/${item.id}`) }

  if (item.photo_path && !imgFailed) {
    return (
      <button onClick={go} title="Open item page">
        <img
          src={item.photo_path}
          alt={item.item_name}
          className="w-9 h-9 rounded-lg object-cover border border-slate-200 hover:opacity-80"
          onError={() => setImgFailed(true)}
        />
      </button>
    )
  }
  return (
    <button onClick={go} title="Open item page" className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 hover:bg-slate-200 hover:text-slate-400">
      <ImageIcon size={16} />
    </button>
  )
}

function ClientItemForm({ clientId, editing, onClose }: { clientId: number; editing: ClientItem | null; onClose: () => void }) {
  const create = clientItemHooks.useCreate()
  const update = clientItemHooks.useUpdate()
  const createPrice = clientItemPriceHooks.useCreate()

  const [form, setForm] = useState<CreateClientItemRequest>({
    client_id: clientId,
    item_name: editing?.item_name ?? '',
    size:      editing?.size      ?? null,
    notes:     editing?.notes     ?? null,
  })

  // Initial price — new items only. Editing an existing item's price goes
  // through the Year-by-Year spreadsheet/calculator instead, since a price
  // there is always tied to a specific year, not "the" price.
  const [priceDigits, setPriceDigits] = useState('') // raw digit string — see NumberFormat.ts
  const [priceYear, setPriceYear] = useState(new Date().getFullYear())
  const [priceEffectiveDate, setPriceEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  const handleSubmit = () => {
    if (editing) {
      update.mutate({ id: editing.id, body: form }, { onSuccess: onClose })
    } else {
      create.mutate(form, {
        onSuccess: (newItem) => {
          if (priceDigits) {
            createPrice.mutate({
              client_item_id: newItem.id,
              year: priceYear,
              price: Number(priceDigits),
              effective_date: priceEffectiveDate ? new Date(priceEffectiveDate).toISOString() : null,
            })
          }
          onClose()
        },
      })
    }
  }

  const busy = create.isPending || update.isPending || createPrice.isPending

  return (
    <div className="space-y-4">
      <FormField label="Item Name" required>
        <UppercaseField className="field" placeholder="e.g. Kemeja Batik Lengan Panjang" value={form.item_name}
          onChange={v => setForm(p => ({ ...p, item_name: v }))} />
      </FormField>
      <FormField label="Size">
        <UppercaseField className="field" placeholder="e.g. XL" value={form.size ?? ''}
          onChange={v => setForm(p => ({ ...p, size: v || null }))} />
      </FormField>
      <FormField label="Notes">
        <UppercaseField as="textarea" className="field resize-none" rows={2} value={form.notes ?? ''}
          onChange={v => setForm(p => ({ ...p, notes: v || null }))} />
      </FormField>
      <p className="text-xs text-slate-400 -mt-2">Product photo can be added after saving, from the item's own page.</p>

      {!editing && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Initial Price (optional)</p>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Price">
              <input className="field font-mono" inputMode="numeric" placeholder="e.g. 120,000"
                value={formatThousands(priceDigits)}
                onChange={e => setPriceDigits(stripCommas(e.target.value))} />
            </FormField>
            <FormField label="Year">
              <input className="field" type="number" value={priceYear}
                onChange={e => setPriceYear(Number(e.target.value) || priceYear)} />
            </FormField>
            <FormField label="Effective Date">
              <input className="field" type="date" value={priceEffectiveDate}
                onChange={e => setPriceEffectiveDate(e.target.value)} />
            </FormField>
          </div>
          <p className="text-xs text-slate-400">
            Leave Price blank to skip — you can always add a price later from the item's own page.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clientId = Number(id)

  const { data: client, isLoading: clientLoading } = clientHooks.useGet(clientId)

  const { data: contacts = [], isLoading: contactsLoading } = clientContactHooks.useByClient(clientId)
  const delContact = clientContactHooks.useDelete()

  const { data: catalogueItems = [], isLoading: itemsLoading } = clientItemHooks.useByClient(clientId)
  const delItem = clientItemHooks.useDelete()

  // Only fetched now to build pricesByItem for the print dialog below —
  // the year-by-year spreadsheet/calculator that used to live on this page
  // moved to ClientItemDetailPage, which fetches its own item's history.
  const { data: groupedPrices } = clientItemPriceHooks.useGrouped()

  const [showPrint, setShowPrint] = useState(false)
  // Backed by ?tab= instead of plain useState — ClientItemDetailPage's
  // "back to catalogue" link does a real route change to this page (a
  // remount, not a re-render), which would otherwise reset any local
  // state back to the 'contacts' default every time.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'catalogue' ? 'catalogue' : 'contacts'
  const setTab = (next: 'contacts' | 'catalogue') => setSearchParams({ tab: next }, { replace: true })

  if (clientLoading) {
    return <Spinner />
  }
  if (!client) {
    return <div className="p-8 text-red-400">Client not found.</div>
  }

  const pricesByItem: Record<number, ClientItemPrice[]> = {}
  catalogueItems.forEach(item => {
    pricesByItem[item.id] = groupedPrices?.[String(item.id)] ?? []
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/clients')} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to clients">
            <ArrowLeft size={18} />
          </button>
          <Building2 className="text-navy-600" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{client.client_name}</h2>
            {client.address && <p className="text-xs text-slate-400">{client.address}</p>}
          </div>
        </div>
        <button
          onClick={() => setShowPrint(true)}
          disabled={catalogueItems.length === 0}
          className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-40"
        >
          <Printer size={15} /> Print Price List
        </button>
      </div>

      {client.notes && (
        <div className="card p-3 bg-amber-50 border-amber-100 text-sm text-amber-800">
          {client.notes}
        </div>
      )}

      {/* Tabs — Contacts and Catalogue used to stack on one long page,
          which got cramped once a client had any real amount of either.
          Catalogue + its price history stay together under one tab since
          the pricing spreadsheet is meaningless without the items it
          prices. */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab('contacts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'contacts' ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Points of Contact ({contacts.length})
        </button>
        <button
          onClick={() => setTab('catalogue')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'catalogue' ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Catalogue & Pricing ({catalogueItems.length})
        </button>
      </div>

      {tab === 'contacts' && (
        <CrudPage<ClientContact>
          title="Points of Contact"
          icon={Users}
          data={contacts}
          isLoading={contactsLoading}
          searchKeys={['name', 'role', 'location_label']}
          columns={[
            { header: 'Name', key: 'name', render: r => (
              <span className="font-medium text-navy-900 inline-flex items-center gap-1.5">
                {r.name}
                {r.is_primary && <span className="badge bg-amber-50 text-amber-700 text-[10px]">Primary</span>}
              </span>
            )},
            { header: 'Role',     key: 'role',           render: r => <span className="text-slate-500">{r.role ?? '—'}</span> },
            { header: 'Phone',    key: 'phone_number',    render: r => <span className="text-slate-500">{r.phone_number ?? '—'}</span> },
            { header: 'Email',    key: 'email',           render: r => <span className="text-slate-500">{r.email ?? '—'}</span> },
            { header: 'Location', key: 'location_label',  render: r => <span className="text-slate-500">{r.location_label ?? '—'}</span> },
          ]}
          formTitle={e => e ? 'Edit Contact' : 'Add Contact'}
          renderForm={(editing, onClose) => <ClientContactForm clientId={clientId} editing={editing} onClose={onClose} />}
          onDelete={id => delContact.mutate(id)}
          deleteMessage={r => `Remove contact "${r.name}"?`}
        />
      )}

      {tab === 'catalogue' && (
        // Just the list now — click a row's photo icon (or the item name)
        // to open ClientItemDetailPage, where that item's own price
        // history, hike calculator, and photo management live. This tab's
        // only other job is "Print Price List" up top, which works off
        // whatever's checked in the picker regardless of which item pages
        // anyone's visited.
        <CrudPage<ClientItem>
          title="Catalogue"
          icon={Package}
          data={catalogueItems}
          isLoading={itemsLoading}
          searchKeys={['item_name', 'size', 'notes']}
          columns={[
            { header: 'Photo', key: 'id',        render: r => <ClientItemPhotoCell item={r} clientId={clientId} /> },
            { header: 'Item',  key: 'item_name', render: r => (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/clients/${clientId}/items/${r.id}`) }}
                className="font-medium text-navy-900 hover:text-navy-600 hover:underline text-left"
              >
                {r.item_name}
              </button>
            )},
            { header: 'Size',  key: 'size',      render: r => <span className="text-slate-500">{r.size ?? '—'}</span> },
            { header: 'Notes', key: 'notes',     render: r => <span className="text-slate-500">{r.notes ?? '—'}</span> },
          ]}
          formTitle={e => e ? 'Edit Item' : 'Add Item'}
          renderForm={(editing, onClose) => <ClientItemForm clientId={clientId} editing={editing} onClose={onClose} />}
          onDelete={id => delItem.mutate(id)}
          deleteMessage={r => `Delete "${r.item_name}"? This also removes its price history.`}
        />
      )}

      {showPrint && (
        <ClientPriceListPrint
          client={client}
          items={catalogueItems}
          pricesByItem={pricesByItem}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}