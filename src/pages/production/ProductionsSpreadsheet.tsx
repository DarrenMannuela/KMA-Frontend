import { SpreadsheetView, type ColumnDef } from '@/components/ui/SpreadsheetView'
import { formatRp } from '@/components/ui'
import { productionHooks, supplierHooks } from '@/hooks'
import { todayISODate, formatDateShort } from '@/utils/MonthUtils'
import { SI_UNITS } from '@/utils/Units'
import type { ProductionRow, CreateProductionRowRequest } from '@/types'

interface ProductionSpreadsheetProps {
  /** Already filtered by the parent page (e.g. by month, and optionally by supplier). */
  data: ProductionRow[]
  /** New rows default to this supplier — set when the parent has drilled into one supplier. */
  defaultSupplierId?: number
  /** Turn off grouping when the parent has already filtered to a single supplier. */
  groupBySupplier?: boolean
}

export function ProductionSpreadsheet({ data, defaultSupplierId, groupBySupplier = true }: ProductionSpreadsheetProps) {
  const { data: suppliers = [] } = supplierHooks.useList()
  const create = productionHooks.useCreate()
  const update = productionHooks.useUpdate()
  const del = productionHooks.useDelete()

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.supplier_name }))
  const unitOptions = SI_UNITS.map(u => ({ value: u, label: u }))
  const supplierName = (id: number) => suppliers.find(s => s.id === id)?.supplier_name ?? 'Unassigned'

  // When a supplier filter is active there's nothing left to group by
  // supplier — group by Kas Bon ID instead so items from the same header
  // sit together, and Supplier (already conveyed by the page filter/title
  // in that mode) drops out of the per-row columns.
  //
  // Date isn't a per-row column — it lives on the shared FinanceHeader, not
  // the item, and now that formatDateShort's bug is fixed it displays
  // correctly in the group header (see renderGroupHeader below) without
  // repeating on every material line. New Kas Bons default to today's date
  // via emptyRowTemplate; there's currently no inline way to set a
  // different date at creation time.
  const groupedByHeader = !groupBySupplier

  const col = {
    header_id: {
      key: 'header_id', header: 'Kas Bon ID', type: 'text', editable: true, width: '110px', placeholder: 'e.g. 01/KB/26',
    } as ColumnDef<ProductionRow>,
    description: {
      key: 'description', header: 'Description', type: 'text', editable: true, placeholder: 'e.g. Beli bahan Basic 902',
    } as ColumnDef<ProductionRow>,
    material_name: {
      key: 'material_name', header: 'Bahan', type: 'text', editable: true, placeholder: 'e.g. Basic 902',
    } as ColumnDef<ProductionRow>,
    supplier_id: {
      key: 'supplier_id', header: 'Supplier', type: 'select', editable: true,
      options: supplierOptions,
      format: (val: number) => supplierName(Number(val)),
    } as ColumnDef<ProductionRow>,
    amount: {
      key: 'amount', header: 'Qty', type: 'number', editable: true, width: '80px',
    } as ColumnDef<ProductionRow>,
    si_unit: {
      key: 'si_unit', header: 'Unit', type: 'select', editable: true, options: unitOptions,
    } as ColumnDef<ProductionRow>,
    price: {
      key: 'price', header: 'Price', type: 'number', editable: true,
      format: (val: number) => <span className="currency font-mono">{formatRp(Number(val))}</span>,
    } as ColumnDef<ProductionRow>,
    total: {
      key: 'price', header: 'Total', type: 'number', editable: false,
      format: (_val: number, row: ProductionRow) => (
        <span className="currency font-mono font-semibold">{formatRp(row.price * row.amount)}</span>
      ),
    } as ColumnDef<ProductionRow>,
  }

  // Kas Bon ID, Description, Bahan, Qty, Unit, Price (+ Total).
  // Supplier only shows up when not already filtered to one.
  const columns: ColumnDef<ProductionRow>[] = groupedByHeader
    ? [col.header_id, col.description, col.material_name, col.amount, col.si_unit, col.price, col.total]
    : [col.header_id, col.description, col.material_name, col.supplier_id, col.amount, col.si_unit, col.price, col.total]

  return (
    <SpreadsheetView<ProductionRow>
      data={data}
      maxHeight="60vh"
      groupByKey={groupedByHeader ? (row => row.header_id) : (row => supplierName(row.supplier_id))}
      renderGroupHeader={groupedByHeader ? (_groupName, rows) => {
        const first = rows[0]
        return (
          <>
            <span className="font-mono">{first.header_id}</span>
            <span className="text-slate-400 font-normal"> — {first.description || 'No description'}</span>
            <span className="text-slate-400 font-normal"> · {formatDateShort(first.date)}</span>
          </>
        )
      } : undefined}
      calculateSubtotal={row => row.price * row.amount}
      keyColumn="id"
      triggerColumn="material_name"
      emptyRowTemplate={() => ({
        header_id: '',
        description: '',
        supplier_id: defaultSupplierId ?? suppliers[0]?.id ?? 0,
        material_name: '',
        price: 0,
        si_unit: 'yard',
        amount: 1,
        date: todayISODate(),
      })}
      onCreateRow={(row) => create.mutate(row as CreateProductionRowRequest)}
      onUpdateRow={(id, body) => update.mutate({ id: Number(id), body })}
      onDeleteRow={(id) => del.mutate(Number(id))}
      columns={columns}
    />
  )
}