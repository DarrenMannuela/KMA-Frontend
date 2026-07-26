import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField } from '@/components/ui'
import { clientHooks } from '@/hooks'
import type { Client, CreateClientRequest } from '@/types'

function ClientForm({ editing, onClose }: { editing: Client | null; onClose: () => void }) {
  const create = clientHooks.useCreate()
  const update = clientHooks.useUpdate()

  const [form, setForm] = useState<CreateClientRequest>({
    client_name: editing?.client_name ?? '',
    address:     editing?.address     ?? null,
    notes:       editing?.notes       ?? null,
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
      <FormField label="Client Name" required>
        <UppercaseField className="field" placeholder="e.g. PT Sumber Makmur" value={form.client_name}
          onChange={v => setForm(p => ({ ...p, client_name: v }))} />
      </FormField>
      <FormField label="Address">
        <UppercaseField as="textarea" className="field resize-none" rows={2} placeholder="e.g. Jl. Industri No. 12, Cikarang" value={form.address ?? ''}
          onChange={v => setForm(p => ({ ...p, address: v || null }))} />
      </FormField>
      <FormField label="Notes">
        <UppercaseField as="textarea" className="field resize-none" rows={2} value={form.notes ?? ''}
          onChange={v => setForm(p => ({ ...p, notes: v || null }))} />
      </FormField>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Client' : 'Add Client'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// Purely the list now — "Catalogue & POC" navigates to /clients/:id
// (a real route, see App.tsx) instead of swapping local state, same
// pattern DeliveryPage uses to link to DeliveryDetailPage.
export function ClientsPage() {
  const { data, isLoading } = clientHooks.useList()
  const del = clientHooks.useDelete()
  const navigate = useNavigate()

  return (
    <CrudPage<Client>
      title="Clients"
      icon={Building2}
      data={data}
      isLoading={isLoading}
      searchKeys={['client_name', 'address']}
      columns={[
        { header: 'ID', key: 'id' },
        { header: 'Client Name', key: 'client_name', render: r => <span className="font-medium text-navy-900">{r.client_name}</span> },
        { header: 'Address', key: 'address', render: r => <span className="text-slate-500">{r.address ?? '—'}</span> },
        // Not a real field — reuses the 'id' key for an actions column, same
        // trick ProductionsSpreadsheet's "Total" column uses (key: 'price').
        { header: '', key: 'id', render: r => (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/clients/${r.id}`) }}
            className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-800"
          >
            Catalogue & POC <ArrowRight size={14} />
          </button>
        )},
      ]}
      formTitle={e => e ? 'Edit Client' : 'Add Client'}
      renderForm={(editing, onClose) => <ClientForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete client "${r.client_name}"? This also removes their contacts and catalogue.`}
    />
  )
}3