import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Building2, Users, Printer } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, Spinner, UppercaseField } from '@/components/ui'
import { clientHooks, clientContactHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { ClientPriceListPrint } from './ClientPriceListPrint'
import { CatalogueTab } from './catalogue/CatalogueTab'
import type { ClientContact, CreateClientContactRequest, ClientItemPrice } from '@/types'

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clientId = Number(id)

  const { data: client, isLoading: clientLoading, isError: clientError, refetch: refetchClient } = clientHooks.useGet(clientId)

  const { data: contacts = [], isLoading: contactsLoading, isError: contactsError, refetch: refetchContacts } = clientContactHooks.useByClient(clientId)
  const delContact = clientContactHooks.useDelete()

  const { data: catalogueItems = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = clientItemHooks.useByClient(clientId)
  const { data: groupedPrices } = clientItemPriceHooks.useGrouped()

  // Above the early returns, for a stable hook order.
  const pricesByItem: Record<number, ClientItemPrice[]> = useMemo(() => {
    const map: Record<number, ClientItemPrice[]> = {}
    catalogueItems.forEach(item => {
      map[item.id] = groupedPrices?.[String(item.id)] ?? []
    })
    return map
  }, [catalogueItems, groupedPrices])

  // The year the price list is printed for; null: not printing.
  const [printYear, setPrintYear] = useState<number | null>(null)
  // The tab lives in ?tab= so coming back from an item page keeps it.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'catalogue' ? 'catalogue' : 'contacts'
  const setTab = (next: 'contacts' | 'catalogue') => setSearchParams({ tab: next }, { replace: true })

  if (clientLoading) {
    return <Spinner />
  }
  // A failed fetch shows Retry, not "Client not found".
  if (clientError) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
        <p className="text-red-400 mb-3">Couldn't load this client — check your connection and try again.</p>
        <button onClick={() => refetchClient()} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!client) {
    return <div className="p-8 text-red-400">Client not found.</div>
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
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
          onClick={() => setPrintYear(new Date().getFullYear())}
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

      {/* Tabs: Contacts, and Catalogue with its prices. */}
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
          isError={contactsError}
          onRetry={refetchContacts}
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
        <CatalogueTab
          client={client}
          items={catalogueItems}
          isLoading={itemsLoading}
          isError={itemsError}
          onRetry={refetchItems}
          allPrices={groupedPrices ?? {}}
          pricesByItem={pricesByItem}
          onPrint={setPrintYear}
        />
      )}

      {printYear != null && (
        <ClientPriceListPrint
          client={client}
          year={printYear}
          items={catalogueItems}
          pricesByItem={pricesByItem}
          onClose={() => setPrintYear(null)}
        />
      )}
    </div>
  )
}