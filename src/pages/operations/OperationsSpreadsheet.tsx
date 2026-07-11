import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { operationHooks } from '@/hooks'
import { todayISODate, formatDateShort } from '@/utils/MonthUtils'
import type { OperationRow, CreateOperationRowRequest } from '@/types'

interface OperationsSpreadsheetProps {
  /** Already filtered by the parent page (e.g. by month). */
  data: OperationRow[]
}

export function OperationsSpreadsheet({ data }: OperationsSpreadsheetProps) {
  const create = operationHooks.useCreate()
  const update = operationHooks.useUpdate()
  const del = operationHooks.useDelete()

  // Date isn't a per-row column — it lives on the shared FinanceHeader, not
  // the item, and shows correctly in the group header (see
  // renderGroupHeader below) now that formatDateShort's bug is fixed. New
  // Kas Bons default to today's date via emptyRowTemplate.
  const columns: ColumnDef<OperationRow>[] = [
    { key: 'header_id', header: 'Kas Bon ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26' },
    { key: 'description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Transport, Beli bahan…' },
    { key: 'item_description', header: 'Item', type: 'text', editable: true, placeholder: 'e.g. Ojek to supplier' },
    {
      key: 'price', header: 'Amount', type: 'number', editable: true,
      format: (val) => <span className="currency font-mono font-semibold">{formatRp(Number(val))}</span>,
    },
  ]

  return (
    <SpreadsheetView<OperationRow>
      data={data}
      maxHeight="60vh"
      keyColumn="id"
      triggerColumn="item_description"
      groupByKey={row => row.header_id}
      renderGroupHeader={(_groupName, rows) => {
        const first = rows[0]
        return (
          <>
            <span className="font-mono">{first.header_id}</span>
            <span className="text-slate-400 font-normal"> — {first.description || 'No description'}</span>
            <span className="text-slate-400 font-normal"> · {formatDateShort(first.date)}</span>
          </>
        )
      }}
      calculateSubtotal={row => row.price}
      emptyRowTemplate={() => ({ header_id: '', description: '', item_description: '', price: 0, date: todayISODate() })}
      onCreateRow={(row) => create.mutate(row as CreateOperationRowRequest)}
      onUpdateRow={(id, body) => update.mutate({ id: Number(id), body })}
      onDeleteRow={(id) => del.mutate(Number(id))}
      columns={columns}
    />
  )
}