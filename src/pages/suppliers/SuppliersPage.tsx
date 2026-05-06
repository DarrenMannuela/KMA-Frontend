import { useState } from 'react'
import { Users } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField } from '@/components/ui'
import { supplierHooks } from '@/hooks'
import type { Supplier, CreateSupplierRequest, SupplierCategory } from '@/types'

// Exact enum values from kma.yaml
const SUPPLIER_CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: 'sablon',                label: 'Sablon' },
  { value: 'embroidery',            label: 'Embroidery' },
  { value: 'merchandise_supplier',  label: 'Merchandise Supplier' },
  { value: 'uniform_supplier',      label: 'Uniform Supplier' },
  { value: 'general_supplier',      label: 'General Supplier' },
]

const CATEGORY_BADGE: Record<SupplierCategory, string> = {
  sablon:                'bg-purple-50 text-purple-700',
  embroidery:            'bg-pink-50 text-pink-700',
  merchandise_supplier:  'bg-blue-50 text-blue-700',
  uniform_supplier:      'bg-navy-50 text-navy-700',
  general_supplier:      'bg-slate-100 text-slate-600',
}

function SupplierForm({ editing, onClose }: { editing: Supplier | null; onClose: () => void }) {
  const create = supplierHooks.useCreate()
  const update = supplierHooks.useUpdate()

  const [form, setForm] = useState<CreateSupplierRequest>({
    supplier_name:     editing?.supplier_name     ?? '',
    supplier_category: editing?.supplier_category ?? 'general_supplier',
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
      <FormField label="Supplier Name" required>
        <input className="field" placeholder="e.g. SAI Textile" value={form.supplier_name}
          onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))} />
      </FormField>
      <FormField label="Category" required>
        <select className="field" value={form.supplier_category}
          onChange={e => setForm(p => ({ ...p, supplier_category: e.target.value as SupplierCategory }))}>
          {SUPPLIER_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Supplier' : 'Add Supplier'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function SuppliersPage() {
  const { data, isLoading } = supplierHooks.useList()
  const del = supplierHooks.useDelete()

  return (
    <CrudPage<Supplier>
      title="Suppliers"
      icon={Users}
      data={data}
      isLoading={isLoading}
      searchKeys={['supplier_name', 'supplier_category']}
      columns={[
        { header: 'ID',       key: 'id' },
        { header: 'Name',     key: 'supplier_name',     render: r => <span className="font-medium text-navy-900">{r.supplier_name}</span> },
        { header: 'Category', key: 'supplier_category', render: r => (
          <span className={`badge ${CATEGORY_BADGE[r.supplier_category] ?? 'badge-slate'}`}>
            {SUPPLIER_CATEGORIES.find(c => c.value === r.supplier_category)?.label ?? r.supplier_category}
          </span>
        )},
      ]}
      formTitle={e => e ? 'Edit Supplier' : 'Add Supplier'}
      renderForm={(editing, onClose) => <SupplierForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete supplier "${r.supplier_name}"?`}
    />
  )
}
