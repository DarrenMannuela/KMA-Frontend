import { Wrench } from 'lucide-react'
import { SpreadsheetView } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { operationHooks } from '@/hooks'
import type { Operation, CreateOperationRequest } from '@/types'

export function OperationSpreadsheet() {
  const { data = [], isLoading } = operationHooks.useList()
  const create = operationHooks.useCreate()
  const update = operationHooks.useUpdate()
  const del = operationHooks.useDelete()

  const total = data.reduce((s, o) => s + o.price, 0)

  if (isLoading) {
    return <div className="p-6 text-slate-400 text-sm">Loading operations ledger…</div>
  }

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="text-navy-600" size={20} />
          <h2 className="text-lg font-semibold text-slate-800">Operations Costs</h2>
        </div>
        <div className="card px-4 py-2 bg-navy-900 border-navy-800 flex items-center gap-3">
          <span className="text-navy-300 text-xs font-medium">Total</span>
          <span className="font-mono font-bold text-white">{formatRp(total)}</span>
        </div>
      </div>

      <SpreadsheetView<Operation>
        data={data}
        maxHeight="72vh"
        keyColumn="id"
        emptyRowTemplate={() => ({ description: '', price: 0 })}
        onCreateRow={(row) => create.mutate(row as CreateOperationRequest)}
        onUpdateRow={(id, body) => update.mutate({ id, body })}
        onDeleteRow={(id) => del.mutate(id)}
        columns={[
          { key: 'id', header: 'ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26' },
          { key: 'description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Transport, Beli bahan…' },
          {
            key: 'price', header: 'Amount', type: 'number', editable: true,
            format: (val) => <span className="currency font-mono font-semibold">{formatRp(Number(val))}</span>,
          },
        ]}
      />
    </div>
  )
}