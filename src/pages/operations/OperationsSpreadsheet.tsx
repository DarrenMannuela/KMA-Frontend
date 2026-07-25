import { useMemo } from 'react'
import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { operationHooks } from '@/hooks'
import { todayISODate } from '@/utils/MonthUtils'
import type { OperationRow, CreateOperationRowRequest } from '@/types'

interface OperationsSpreadsheetProps {
  /** Already filtered by the parent page (e.g. by month, and optionally by category). */
  data: OperationRow[]
}

// Field naming: `category` is per-item (e.g. "Transport", "Utilities") —
// shown as "Category" here. `item_description` is the specific per-line
// detail (e.g. "Biaya transport", "Token listrik") — shown as
// "Description". `description` (header-level) is just the Kas Bon's own
// receipt memo and isn't shown as a column here. Grouping is by Category
// rather than Kas Bon ID: Kas Bon ID is just a reference number on a
// physical receipt and isn't a meaningful way to read the spreadsheet,
// whereas Category is (mirrors why Production groups by Supplier).
export function OperationsSpreadsheet({ data }: OperationsSpreadsheetProps) {
  const create = operationHooks.useCreate()
  const update = operationHooks.useUpdate()
  const del = operationHooks.useDelete()

  // Existing Kas Bon IDs as autocomplete suggestions — see the same
  // comment in ProductionsSpreadsheet for why this matters (typos here
  // silently create a second, disconnected header instead of erroring).
  const headerIdSuggestions = useMemo(
    () => Array.from(new Set(data.map(r => r.header_id))).sort(),
    [data]
  )
  // Existing categories as suggestions too — cuts down on "Transport" vs
  // "TRANSPORT" vs "Transportasi" fracturing the same category into
  // several spend buckets.
  const categorySuggestions = useMemo(
    () => Array.from(new Set(data.map(r => r.category).filter(Boolean))).sort(),
    [data]
  )

  const columns: ColumnDef<OperationRow>[] = [
    { key: 'header_id', header: 'ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26', suggestions: headerIdSuggestions, uppercase: true },
    { key: 'category', header: 'Category', type: 'text', editable: true, placeholder: 'e.g. Transport, Utilities…', suggestions: categorySuggestions, uppercase: true },
    { key: 'item_description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Ojek to supplier, Token listrik…', uppercase: true },
    {
      key: 'price', header: 'Amount', type: 'number', editable: true,
      format: (val) => <span className="currency font-mono font-semibold">{formatRp(Number(val))}</span>,
    },
  ]

  return (
    <SpreadsheetView<OperationRow>
      data={data}
      maxHeight="78vh"
      keyColumn="id"
      triggerColumn="item_description"
      groupByKey={row => row.category || 'Uncategorized'}
      renderGroupHeader={(groupName, rows) => (
        <>
          <span>{groupName}</span>
          <span className="text-slate-400 font-normal"> · Rp {rows.reduce((s, r) => s + r.price, 0).toLocaleString('id-ID')}</span>
        </>
      )}
      calculateSubtotal={row => row.price}
      emptyRowTemplate={() => ({ header_id: '', description: '', category: '', item_description: '', price: 0, date: todayISODate() })}
      onCreateRow={(row) => create.mutate(row as CreateOperationRowRequest)}
      onUpdateRow={(id, body) => update.mutate({ id: Number(id), body })}
      onDeleteRow={(id) => del.mutate(Number(id))}
      columns={columns}
    />
  )
}