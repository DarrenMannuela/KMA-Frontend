import { useMemo, useState } from 'react'
import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { NewKasBonDateModal } from '@/components/ui/NewKasBonDateModal'
import { formatRp } from '@/components/ui'
import { operationHooks, useFinanceHeaders } from '@/hooks'
import { todayISODate } from '@/utils/MonthUtils'
import { suggestNextKasBonId } from '@/utils/KasBonId'
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
  const { data: headers = [] } = useFinanceHeaders()
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

  // Full set of Kas Bon IDs that already exist (from headers, not just this
  // filtered `data` slice — `data` may be scoped to one month/category and
  // would otherwise mislabel an ID from a different month as "new").
  const existingHeaderIds = useMemo(
    () => new Set(headers.map(h => h.id)),
    [headers]
  )

  // Holds a row that's ready to submit except for its date, plus the
  // resolver SpreadsheetView is awaiting — set only when the typed
  // header_id doesn't match any existing Kas Bon.
  const [pendingNewKasBon, setPendingNewKasBon] = useState<{
    payload: CreateOperationRowRequest
    resolve: (keepGoing: boolean) => void
  } | null>(null)

  // Intercepts creation: a brand-new Kas Bon ID has no date column of its
  // own to capture a date from, so pause here and ask via the modal instead
  // of silently taking emptyRowTemplate's today-default. Adding another
  // line to an *existing* Kas Bon skips straight to create.mutate.
  const handleCreateRow = (row: Partial<OperationRow>) => {
    const payload = { ...row, description: row.description || row.category } as CreateOperationRowRequest
    const isNewKasBon = !!payload.header_id && !existingHeaderIds.has(payload.header_id)

    if (!isNewKasBon) {
      create.mutate(payload)
      return
    }

    return new Promise<boolean>(resolve => {
      setPendingNewKasBon({ payload, resolve })
    })
  }

  const confirmNewKasBon = (date: string) => {
    if (!pendingNewKasBon) return
    create.mutate({ ...pendingNewKasBon.payload, date })
    pendingNewKasBon.resolve(true)
    setPendingNewKasBon(null)
  }

  // Resolving `false` tells SpreadsheetView to restore the typed row into
  // the "New entries" buffer rather than discarding it.
  const cancelNewKasBon = () => {
    if (!pendingNewKasBon) return
    pendingNewKasBon.resolve(false)
    setPendingNewKasBon(null)
  }

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
    <>
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
        // Same suggestion Quick Add uses (useKasBonIdSuggestion ->
        // suggestNextKasBonId) — a fresh row starts pre-filled with the next
        // Kas Bon number instead of blank, but it's still a regular editable
        // field, so typing over it works exactly like overriding Quick Add's
        // suggestion.
        emptyRowTemplate={() => ({ header_id: suggestNextKasBonId(headers), description: '', category: '', item_description: '', price: 0, date: todayISODate() })}
        onCreateRow={handleCreateRow}
        onUpdateRow={(id, body) => update.mutate({ id: Number(id), body })}
        onDeleteRow={(id) => del.mutate(Number(id))}
        columns={columns}
      />
      {pendingNewKasBon && (
        <NewKasBonDateModal
          headerId={pendingNewKasBon.payload.header_id}
          defaultDate={pendingNewKasBon.payload.date || todayISODate()}
          onConfirm={confirmNewKasBon}
          onCancel={cancelNewKasBon}
        />
      )}
    </>
  )
}