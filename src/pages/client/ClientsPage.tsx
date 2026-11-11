import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Building2, ArrowRight } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField } from '@/components/ui'
import { clientHooks } from '@/hooks'
import type { Client, CreateClientRequest } from '@/types'

function ClientForm({ editing, onClose }: { editing: Client | null; onClose: () => void }) {
  const { t } = useTranslation()
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
      <FormField label={t('clientsArea.clientName')} required>
        <UppercaseField className="field" placeholder={t('clientsArea.clientNamePlaceholder')} value={form.client_name}
          onChange={v => setForm(p => ({ ...p, client_name: v }))} />
      </FormField>
      <FormField label={t('clientsArea.address')}>
        <UppercaseField as="textarea" className="field resize-none" rows={2} placeholder={t('clientsArea.addressPlaceholder')} value={form.address ?? ''}
          onChange={v => setForm(p => ({ ...p, address: v || null }))} />
      </FormField>
      <FormField label={t('clientsArea.notes')}>
        <UppercaseField as="textarea" className="field resize-none" rows={2} value={form.notes ?? ''}
          onChange={v => setForm(p => ({ ...p, notes: v || null }))} />
      </FormField>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? t('common.saving') : editing ? t('clientsArea.updateClient') : t('clientsArea.addClient')}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

// Purely the list now — "Catalogue & POC" navigates to /clients/:id
// (a real route, see App.tsx) instead of swapping local state, same
// pattern DeliveryPage uses to link to DeliveryDetailPage.
export function ClientsPage() {
  const { data, isLoading, isError, refetch } = clientHooks.useList()
  const del = clientHooks.useDelete()
  const update = clientHooks.useUpdate()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <CrudPage<Client>
      title={t('clientsArea.title')}
      icon={Building2}
      data={data}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['client_name', 'address']}
      rowHref={r => `/clients/${r.id}`}
      undoDeletes
      columns={[
        { header: t('clientsArea.id'), key: 'id' },
        { header: t('clientsArea.clientName'), key: 'client_name', primary: true, edit: { type: 'text', uppercase: true },
          render: r => <span className="font-medium text-navy-900 dark:text-slate-100">{r.client_name}</span> },
        { header: t('clientsArea.address'), key: 'address', edit: { type: 'text', uppercase: true, value: r => r.address ?? '' },
          render: r => <span className="text-slate-500 dark:text-slate-400">{r.address ?? '—'}</span> },
        // An actions column; its key must differ from the ID column's.
        { header: '', key: 'catalogue_link', render: r => (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/clients/${r.id}`) }}
            className="tap inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-800"
          >
            {t('clientsArea.cataloguePoc')} <ArrowRight size={14} />
          </button>
        )},
      ]}
      formTitle={e => e ? t('clientsArea.editClient') : t('clientsArea.addClient')}
      renderForm={(editing, onClose) => <ClientForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => t('clientsArea.deleteConfirm', { name: r.client_name })}
      onCellEdit={(row, key, value) => {
        if (key === 'client_name' && !String(value ?? '').trim()) { toast.error(t('clientsArea.nameRequired')); return }
        update.mutate({ id: row.id, body: { [key]: value || null } as Partial<CreateClientRequest> })
      }}
    />
  )
}