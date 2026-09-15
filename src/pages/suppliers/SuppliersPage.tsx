import { useState } from 'react'
import { Users } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, UppercaseField } from '@/components/ui'
import { supplierHooks } from '@/hooks'
import { CATEGORY_LABELS } from '@/constants/supplierCategories'
import type { Supplier, CreateSupplierRequest, SupplierCategory } from '@/types'

// Exact enum values from kma.yaml, in the order the <select> below should
// list them — labels themselves come from the shared CATEGORY_LABELS
// (supplierCategories.ts) rather than being redefined here. This page used
// to spell out its own longer labels ("Merchandise Supplier") that didn't
// match the short ones CATEGORY_LABELS renders everywhere else the same
// category shows up (Production's dropdown, group headers, the Supplier
// column) — same category, two different names depending on which screen
// you were on.
const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'sablon', 'embroidery', 'merchandise_supplier', 'uniform_supplier', 'general_supplier',
]

// Same hue per category as CATEGORY_COLORS (supplierCategories.ts) — those
// are hex values for a small solid dot elsewhere (Production's supplier
// bars/rows), not usable directly as Tailwind classes for a light-bg/dark-
// text badge pill here, but picked to match: amber/teal/violet/rose/slate
// either way, so the same category reads as the same color family on this
// page as everywhere else, just rendered as a badge instead of a dot.
const CATEGORY_BADGE: Record<SupplierCategory, string> = {
  sablon:                'bg-amber-50 text-amber-700',
  embroidery:            'bg-teal-50 text-teal-700',
  merchandise_supplier:  'bg-violet-50 text-violet-700',
  uniform_supplier:      'bg-rose-50 text-rose-700',
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
        <UppercaseField className="field" placeholder="e.g. SAI Textile" value={form.supplier_name}
          onChange={v => setForm(p => ({ ...p, supplier_name: v }))} />
      </FormField>
      <FormField label="Category" required>
        <select className="field" value={form.supplier_category}
          onChange={e => setForm(p => ({ ...p, supplier_category: e.target.value as SupplierCategory }))}>
          {SUPPLIER_CATEGORIES.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
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
  const { data, isLoading, isError, refetch } = supplierHooks.useList()
  const del = supplierHooks.useDelete()

  return (
    <CrudPage<Supplier>
      title="Suppliers"
      icon={Users}
      data={data}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['supplier_name', 'supplier_category']}
      columns={[
        { header: 'ID',       key: 'id' },
        { header: 'Name',     key: 'supplier_name',     primary: true, render: r => <span className="font-medium text-navy-900">{r.supplier_name}</span> },
        { header: 'Category', key: 'supplier_category', render: r => (
          <span className={`badge ${CATEGORY_BADGE[r.supplier_category] ?? 'badge-slate'}`}>
            {CATEGORY_LABELS[r.supplier_category] ?? r.supplier_category}
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