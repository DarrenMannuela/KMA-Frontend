import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { MobileEntryList } from '@/components/ui/MobileEntryList'
import { formatRp } from '@/components/ui'
import { clientItemPriceHooks, type ClientItemPriceRow } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatDateShort } from '@/utils/MonthUtils'
import type { ClientItem } from '@/types'

interface ClientItemPriceSpreadsheetProps {
  /** Already scoped to one client. */
  data: ClientItemPriceRow[]
  /** This client's catalogue — populates the "Item" select and its labels. */
  items: ClientItem[]
}

export function ClientItemPriceSpreadsheet({ data, items }: ClientItemPriceSpreadsheetProps) {
  const update = clientItemPriceHooks.useUpdate()
  const del = clientItemPriceHooks.useDelete()

  // A select: prices can only be added to existing catalogue items.
  const itemOptions = items.map(i => ({
    value: i.id,
    label: i.size ? `${i.item_name} (${i.size})` : i.item_name,
  }))
  const itemLabel = (id: number) => {
    const item = items.find(i => i.id === id)
    if (!item) return 'Unknown item'
    return item.size ? `${item.item_name} (${item.size})` : item.item_name
  }

  // The Item column only when there's more than one item (the group header
  // already names a single one).
  const columns: ColumnDef<ClientItemPriceRow>[] = [
    ...(items.length > 1 ? [{
      key: 'client_item_id' as const, header: 'Item', type: 'select' as const, editable: true,
      options: itemOptions,
      // The group header names the item; still editable in the form.
      hideOnCard: true,
      format: (val: number) => <span className="font-medium text-navy-900">{itemLabel(Number(val))}</span>,
    }] : []),
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

  const groupByKey = (row: ClientItemPriceRow) => String(row.client_item_id)
  const renderGroupHeader = (_groupName: string, rows: ClientItemPriceRow[]) => (
    <span className="font-medium">{itemLabel(rows[0].client_item_id)}</span>
  )
  const onUpdateRow = (id: string, body: ClientItemPriceRow) => {
    // Strip the denormalized item_name/size that ride along on the row
    // for display — only real ClientItemPrice fields go over the wire.
    const { item_name, size, ...rest } = body as Partial<ClientItemPriceRow>
    update.mutate({
      id: Number(id),
      // An emptied date is saved as null, like everywhere else.
      body: { ...rest, effective_date: rest.effective_date ? new Date(rest.effective_date).toISOString() : null },
    })
  }
  const onDeleteRow = (id: string) => del.mutate(Number(id))
  const isMobile = useIsMobile()

  return isMobile ? (
    <MobileEntryList<ClientItemPriceRow>
      data={data}
      groupByKey={groupByKey}
      renderGroupHeader={renderGroupHeader}
      keyColumn="id"
      onUpdateRow={onUpdateRow}
      onDeleteRow={onDeleteRow}
      columns={columns}
    />
  ) : (
    <SpreadsheetView<ClientItemPriceRow>
      data={data}
      maxHeight="60vh"
      groupByKey={groupByKey}
      renderGroupHeader={renderGroupHeader}
      keyColumn="id"
      onUpdateRow={onUpdateRow}
      onDeleteRow={onDeleteRow}
      columns={columns}
    />
  )
}