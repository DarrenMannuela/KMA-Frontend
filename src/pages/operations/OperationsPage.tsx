import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp } from '@/components/ui'
import { operationHooks } from '@/hooks'
import type { Operation, CreateOperationRequest } from '@/types'

function OperationForm({ editing, onClose }: { editing: Operation | null; onClose: () => void }) {
  const create = operationHooks.useCreate()
  const update = operationHooks.useUpdate()

  const [form, setForm] = useState<CreateOperationRequest & { id?: string }>({
    id:          editing?.id          ?? '',
    description: editing?.description ?? '',
    price:       editing?.price       ?? 0,
  })

  const handleSubmit = () => {
    const payload: CreateOperationRequest = { description: form.description, price: form.price }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Transaction ID">
        <input className="field font-mono" placeholder="e.g. 01/KB/26" value={form.id ?? ''}
          onChange={e => setForm(p => ({ ...p, id: e.target.value }))} />
      </FormField>
      <FormField label="Description" required>
        <input className="field" placeholder="e.g. Beli bahan, Transport, dll" value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </FormField>
      <FormField label="Amount (Rp)" required>
        <input className="field font-mono" type="number" min={0} value={form.price}
          onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} />
      </FormField>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update' : 'Add Operation'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function OperationsPage() {
  const { data, isLoading } = operationHooks.useList()
  const del = operationHooks.useDelete()

  const total = (data ?? []).reduce((s, o) => s + o.price, 0)

  return (
    <>
      {(data ?? []).length > 0 && (
        <div className="px-6 pt-6">
          <div className="card p-4 bg-navy-900 border-navy-800 flex items-center justify-between">
            <span className="text-navy-300 text-sm font-medium">Total Operational Cost</span>
            <span className="font-mono font-bold text-white text-lg">{formatRp(total)}</span>
          </div>
        </div>
      )}
      <CrudPage<Operation>
        title="Operations"
        icon={Wrench}
        data={data}
        isLoading={isLoading}
        searchKeys={['description']}
        columns={[
          { header: 'ID',          key: 'id',          render: r => <span className="id-chip">{r.id}</span> },
          { header: 'Description', key: 'description', render: r => <span className="font-medium">{r.description}</span> },
          { header: 'Amount',      key: 'price',       render: r => <span className="currency font-semibold">{formatRp(r.price)}</span> },
        ]}
        formTitle={e => e ? 'Edit Operation' : 'Add Operation'}
        renderForm={(editing, onClose) => <OperationForm editing={editing} onClose={onClose} />}
        onDelete={id => del.mutate(id)}
        deleteMessage={r => `Delete operation "${r.description}"?`}
      />
    </>
  )
}
