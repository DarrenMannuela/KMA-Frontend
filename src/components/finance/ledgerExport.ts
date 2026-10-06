import type { Order, Supplier } from '@/types'
import { buildXlsx, downloadBlob, type SheetSpec } from '@/utils/xlsx'
import { CATEGORY_LABELS } from '@/constants/supplierCategories'
import { orderLabel, type LedgerRow } from './ledgerModel'

/** A sheet of production or operation lines, with a totals row. */
export function ledgerSheet(name: string, rows: LedgerRow[], suppliers: Supplier[], orders: Order[]): SheetSpec {
  const kind = rows[0]?.kind ?? 'production'
  const supplier = (id: number) => suppliers.find(s => s.id === id)
  const total = rows.reduce((n, r) => n + r.total, 0)
  if (kind === 'production') {
    return {
      name,
      columns: [
        { header: 'Kas Bon' }, { header: 'Date', kind: 'date', width: 12 }, { header: 'Description' },
        { header: 'Bahan' }, { header: 'Supplier' }, { header: 'Supplier type' },
        { header: 'Qty', kind: 'number', width: 8 }, { header: 'Unit', width: 8 },
        { header: 'Price', kind: 'money', width: 14 }, { header: 'Total', kind: 'money', width: 15 }, { header: 'Order' },
      ],
      rows: rows.map(r => {
        const s = supplier(r.supplier_id)
        return [r.header_id, r.date.slice(0, 10), r.description, r.name, s?.supplier_name ?? '',
          s ? CATEGORY_LABELS[s.supplier_category] : '', r.qty, r.unit, r.price, r.total, orderLabel(orders, r.order_id)]
      }),
      totals: { 0: 'Total', 9: total },
    }
  }
  return {
    name,
    columns: [
      { header: 'Kas Bon' }, { header: 'Date', kind: 'date', width: 12 }, { header: 'Description' },
      { header: 'Category' }, { header: 'Item' }, { header: 'Price', kind: 'money', width: 15 }, { header: 'Order' },
    ],
    rows: rows.map(r => [r.header_id, r.date.slice(0, 10), r.description, r.category, r.name, r.price, orderLabel(orders, r.order_id)]),
    totals: { 0: 'Total', 5: total },
  }
}

export function exportLedger(filename: string, sheets: SheetSpec[]) {
  downloadBlob(buildXlsx(sheets), filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
