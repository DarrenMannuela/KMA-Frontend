import { Factory } from 'lucide-react'
import { SpreadsheetView } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { productionHooks, supplierHooks } from '@/hooks'
import type { Production, CreateProductionRequest } from '@/types'

const SI_UNITS = ['yard', 'meter', 'pcs', 'kg', 'lusin', 'roll', 'lembar']

export function ProductionSpreadsheet() {
  const { data = [], isLoading } = productionHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()
  const create = productionHooks.useCreate()
  const update = productionHooks.useUpdate()
  const del = productionHooks.useDelete()

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.supplier_name }))
  const unitOptions = SI_UNITS.map(u => ({ value: u, label: u }))
  const supplierName = (id: number) => suppliers.find(s => s.id === id)?.supplier_name ?? 'Unassigned'

  if (isLoading) {
    return <div className="p-6 text-slate-400 text-sm">Loading production ledger…</div>
  }

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Factory className="text-navy-600" size={20} />
        <h2 className="text-lg font-semibold text-slate-800">Production Costs</h2>
      </div>

      <SpreadsheetView<Production>
        data={data}
        maxHeight="72vh"
        groupByKey={row => supplierName(row.supplier_id)}
        calculateSubtotal={row => row.price * row.amount}
        keyColumn="id"
        emptyRowTemplate={() => ({
          description: '',
          supplier_id: suppliers[0]?.id ?? 0,
          material_name: '',
          price: 0,
          si_unit: 'yard',
          amount: 1,
        })}
        onCreateRow={(row) => create.mutate(row as CreateProductionRequest)}
        onUpdateRow={(id, body) => update.mutate({ id, body })}
        onDeleteRow={(id) => del.mutate(id)}
        columns={[
          { key: 'id', header: 'ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26' },
          { key: 'description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Beli bahan Basic 902' },
          { key: 'material_name', header: 'Material', type: 'text', editable: true, placeholder: 'e.g. Basic 902' },
          {
            key: 'supplier_id', header: 'Supplier', type: 'select', editable: true,
            options: supplierOptions,
            format: (val) => supplierName(Number(val)),
          },
          { key: 'si_unit', header: 'Unit', type: 'select', editable: true, options: unitOptions },
          {
            key: 'price', header: 'Price / Unit', type: 'number', editable: true,
            format: (val) => <span className="currency font-mono">{formatRp(Number(val))}</span>,
          },
          { key: 'amount', header: 'Qty', type: 'number', editable: true, width: '80px' },
          {
            key: 'price', header: 'Total', type: 'number', editable: false,
            format: (_val, row) => (
              <span className="currency font-mono font-semibold">{formatRp(row.price * row.amount)}</span>
            ),
          },
        ]}
      />
    </div>
  )
}