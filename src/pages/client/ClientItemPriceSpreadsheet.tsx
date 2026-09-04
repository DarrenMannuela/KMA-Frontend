import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { clientItemPriceHooks, type ClientItemPriceRow } from '@/hooks'
import { formatDateShort } from '@/utils/MonthUtils'
import type { ClientItem } from '@/types'

interface ClientItemPriceSpreadsheetProps {
  /** Already scoped to one client (see useClientCatalogueRows in hooks). */
  data: ClientItemPriceRow[]
  /** This client's catalogue — populates the "Item" select and its labels. */
  items: ClientItem[]
}

export function ClientItemPriceSpreadsheet({ data, items }: ClientItemPriceSpreadsheetProps) {
  const update = clientItemPriceHooks.useUpdate()
  const del = clientItemPriceHooks.useDelete()

  // Unlike a Kas Bon ID, a catalogue item can't be typed into existence —
  // it must already exist (created via the Catalogue table above), so this
  // is a select, not free text with autocomplete (contrast
  // ProductionsSpreadsheet's header_id suggestions).
  const itemOptions = items.map(i => ({
    value: i.id,
    label: i.size ? `${i.item_name} (${i.size})` : i.item_name,
  }))
  const itemLabel = (id: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return 'Unknown item'
    return item.size ? `${item.item_name} (${item.size})` : item.item_name
  }

  const columns: ColumnDef<ClientItemPriceRow>[] = [
    {
      key: 'client_item_id', header: 'Item', type: 'select', editable: true,
      options: itemOptions,
      format: (val: number) => <span className="font-medium text-navy-900">{itemLabel(Number(val))}</span>,
    },
    {
      key: 'year', header: 'Year', type: 'number', editable: true, width: '90px',
      format: (val: number) => <span className="font-mono">{val}</span>,
    },
    {
      key: 'price', header: 'Price', type: 'number', editable: true,
      format: (val: number) => <span className="currency font-mono">{formatRp(Number(val))}</span>,
    },
    {
      key: 'effective_date', header: 'Effective Date', type: 'date', editable: true,
      format: (val: string | null) => <span className="text-slate-500">{val ? formatDateShort(val) : '—'}</span>,
    },
  ]

  return (
    <SpreadsheetView<ClientItemPriceRow>
      data={data}
      maxHeight="60vh"
      groupByKey={row => String(row.client_item_id)}
      renderGroupHeader={(_groupName, rows) => (
        <span className="font-medium">{itemLabel(rows[0].client_item_id)}</span>
      )}
      keyColumn="id"
      onUpdateRow={(id, body) => {
        // Strip the denormalized item_name/size that ride along on the row
        // for display — only real ClientItemPrice fields go over the wire.
        const { item_name, size, ...rest } = body as Partial<ClientItemPriceRow>
        update.mutate({
          id: Number(id),
          // Falls back to null, not the raw (possibly '') value — clearing
          // the date via EditableCell leaves rest.effective_date as '',
          // and `rest.effective_date : rest.effective_date` would send
          // that '' straight to the API. Every other place that writes
          // this same field (ClientItemForm, ItemPriceHikeCalculator)
          // falls back to null for "no date", so this matches that
          // instead of introducing a second, inconsistent "empty" value.
          body: { ...rest, effective_date: rest.effective_date ? new Date(rest.effective_date).toISOString() : null },
        })
      }}
      onDeleteRow={(id) => del.mutate(Number(id))}
      columns={columns}
    />
  )
}