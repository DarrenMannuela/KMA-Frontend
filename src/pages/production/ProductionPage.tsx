import { useState } from 'react'
import { Factory } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp } from '@/components/ui'
import { productionHooks, supplierHooks } from '@/hooks'
import type { Production, CreateProductionRequest } from '@/types'

const SI_UNITS = ['yard', 'meter', 'pcs', 'kg', 'lusin', 'roll', 'lembar']

function ProductionForm({ editing, onClose }: { editing: Production | null; onClose: () => void }) {
  const create = productionHooks.useCreate()
  const update = productionHooks.useUpdate()
  const { data: suppliers = [] } = supplierHooks.useList()

  const [form, setForm] = useState<Omit<CreateProductionRequest, 'id'> & { id?: string }>({
    id:            editing?.id            ?? '',
    description:   editing?.description   ?? '',
    supplier_id:   editing?.supplier_id   ?? 0,
    material_name: editing?.material_name ?? '',
    price:         editing?.price         ?? 0,
    si_unit:       editing?.si_unit       ?? 'yard',
    amount:        editing?.amount        ?? 1,
  })

  const total = form.price * form.amount

  const setNum = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: Number(e.target.value) }))
  const setStr = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = () => {
    const payload = { ...form } as CreateProductionRequest
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
        <input className="field font-mono" placeholder="e.g. 01/KB/26" value={form.id ?? ''} onChange={setStr('id')} />
      </FormField>
      <FormField label="Description" required>
        <textarea className="field resize-none" rows={2} placeholder="e.g. Beli bahan Basic 902"
          value={form.description} onChange={setStr('description')} />
      </FormField>
      <FormField label="Supplier" required>
        <select className="field" value={form.supplier_id}
          onChange={e => setForm(p => ({ ...p, supplier_id: Number(e.target.value) }))}>
          <option value={0}>Select supplier…</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Material Name" required>
          <input className="field" placeholder="e.g. Basic 902" value={form.material_name} onChange={setStr('material_name')} />
        </FormField>
        <FormField label="Unit">
          <select className="field" value={form.si_unit} onChange={setStr('si_unit')}>
            {SI_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
        <FormField label="Price / Unit (Rp)">
          <input className="field font-mono" type="number" min={0} value={form.price} onChange={setNum('price')} />
        </FormField>
        <FormField label="Amount">
          <input className="field" type="number" min={1} value={form.amount} onChange={setNum('amount')} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between text-sm">
        <span className="text-slate-500">Total Cost</span>
        <span className="font-mono font-semibold">{formatRp(total)}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update' : 'Add Entry'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function ProductionPage() {
  const { data, isLoading } = productionHooks.useList()
  const del = productionHooks.useDelete()

  return (
    <CrudPage<Production>
      title="Production"
      icon={Factory}
      data={data}
      isLoading={isLoading}
      searchKeys={['material_name', 'description']}
      columns={[
        { header: 'ID',          key: 'id',            render: r => <span className="id-chip">{r.id}</span> },
        { header: 'Description', key: 'description',   render: r => <span className="text-slate-600 text-xs">{r.description}</span> },
        { header: 'Material',    key: 'material_name', render: r => <span className="font-medium">{r.material_name}</span> },
        { header: 'Supplier',    key: 'supplier_id',   render: r => r.supplier?.supplier_name ?? r.supplier_id },
        { header: 'Qty',         key: 'amount',        render: r => `${r.amount} ${r.si_unit}` },
        { header: 'Price/Unit',  key: 'price',         render: r => <span className="currency">{formatRp(r.price)}</span> },
        { header: 'Total',       key: 'price',         render: r => <span className="currency font-semibold">{formatRp(r.price * r.amount)}</span> },
      ]}
      formTitle={e => e ? 'Edit Production Entry' : 'New Production Entry'}
      renderForm={(editing, onClose) => <ProductionForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete production entry "${r.material_name}"?`}
    />
  )
}
