import type { FinanceBatch, ProductionRow, OperationRow, Supplier, Order } from '@/types'
import { CATEGORY_LABELS } from '@/constants/supplierCategories'
import { lineTotal } from '@/hooks/finance'
import { isInMonth, isInYear } from '@/utils/MonthUtils'

export type Kind = 'production' | 'operation'

/** One Kas Bon line, the same shape for both sides. */
export interface LedgerRow {
  kind: Kind
  id: number
  header_id: string
  date: string
  description: string
  name: string          // the material (production) or the cost (operation)
  supplier_id: number   // production
  category: string      // operation category
  qty: number
  unit: string
  price: number
  total: number
  order_id: string | null
}

export const fromProduction = (r: ProductionRow): LedgerRow => ({
  kind: 'production', id: r.id, header_id: r.header_id, date: r.date, description: r.description,
  name: r.material_name, supplier_id: r.supplier_id, category: '', qty: r.amount, unit: r.si_unit,
  price: r.price, total: lineTotal(r), order_id: r.order_id,
})

export const fromOperation = (r: OperationRow): LedgerRow => ({
  kind: 'operation', id: r.id, header_id: r.header_id, date: r.date, description: r.description,
  name: r.item_description, supplier_id: 0, category: r.category, qty: 1, unit: '',
  price: r.price, total: r.price, order_id: r.order_id,
})

/** The fields a line can be edited in. date/description belong to its Kas Bon. */
export type EditField = 'header_id' | 'date' | 'description' | 'name' | 'supplier_id' | 'category' | 'qty' | 'unit' | 'price' | 'order_id'

const ITEM_FIELD: Record<Kind, Partial<Record<EditField, string>>> = {
  production: { header_id: 'header_id', name: 'material_name', supplier_id: 'supplier_id', qty: 'amount', unit: 'si_unit', price: 'price', order_id: 'order_id' },
  operation: { header_id: 'header_id', name: 'description', category: 'category', price: 'price', order_id: 'order_id' },
}

/** The batch that sets `field` to `value` on each of `rows`. */
export function editBatch(rows: LedgerRow[], field: EditField, value: unknown): FinanceBatch {
  if (field === 'date' || field === 'description') {
    const seen = new Map<string, LedgerRow>()
    rows.forEach(r => seen.set(r.header_id, r))
    return {
      header_update: [...seen.values()].map(r => ({
        id: r.header_id,
        date: field === 'date' ? String(value) : r.date,
        description: field === 'description' ? String(value) : r.description,
      })),
    }
  }
  const batch: FinanceBatch = { production_update: [], operation_update: [] }
  for (const r of rows) {
    const key = ITEM_FIELD[r.kind][field]
    if (!key) continue
    const patch = { id: r.id, fields: { [key]: value } }
    if (r.kind === 'production') batch.production_update!.push(patch)
    else batch.operation_update!.push(patch)
  }
  return batch
}

export function deleteBatch(rows: LedgerRow[]): FinanceBatch {
  return {
    production_delete: rows.filter(r => r.kind === 'production').map(r => r.id),
    operation_delete: rows.filter(r => r.kind === 'operation').map(r => r.id),
  }
}

/** A new line, as typed in the Kas Bon form or brought in from a paste/import. */
export interface DraftLine {
  key: string
  kind: Kind
  name: string
  supplier_id: number
  category: string
  qty: string
  unit: string
  price: string
  order_id: string
}

let draftSeq = 0
export function newDraft(kind: Kind, defaults: Partial<DraftLine> = {}): DraftLine {
  draftSeq += 1
  return { key: `d${draftSeq}`, kind, name: '', supplier_id: 0, category: '', qty: kind === 'production' ? '1' : '', unit: 'yard', price: '', order_id: '', ...defaults }
}

const num = (s: string) => {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** What's wrong with a line, or null. */
export function draftProblem(d: DraftLine, supplierIds: Set<number>): string | null {
  if (d.kind === 'production') {
    if (!d.name.trim()) return 'Bahan is missing'
    if (!supplierIds.has(d.supplier_id)) return 'Pick a supplier'
    if (!(num(d.qty) > 0)) return 'Qty must be more than 0'
  } else if (!d.category.trim()) return 'Category is missing'
  if (!(num(d.price) >= 0) || d.price.trim() === '') return 'Price is missing'
  return null
}

export const draftTotal = (d: DraftLine) => {
  const price = num(d.price) || 0
  return d.kind === 'production' ? Math.round(price * (num(d.qty) || 0)) : Math.round(price)
}

/** Adds the lines' creates to a batch, all on Kas Bon `headerId`. */
export function draftsToBatch(lines: DraftLine[], headerId: string, batch: FinanceBatch = {}): FinanceBatch {
  const out: FinanceBatch = { ...batch, production_create: [...(batch.production_create ?? [])], operation_create: [...(batch.operation_create ?? [])] }
  for (const d of lines) {
    const order_id = d.order_id.trim() || null
    if (d.kind === 'production') {
      out.production_create!.push({
        header_id: headerId, material_name: d.name.trim().toUpperCase(), supplier_id: d.supplier_id,
        amount: num(d.qty), si_unit: d.unit, price: Math.round(num(d.price)), order_id,
      })
    } else {
      out.operation_create!.push({
        header_id: headerId, category: d.category.trim().toUpperCase(),
        description: (d.name.trim() || d.category.trim()).toUpperCase(), price: Math.round(num(d.price)), order_id,
      })
    }
  }
  return out
}

// ── Filtering, grouping, labels ──────────────────────────────────────────────

export type PeriodMode = 'month' | 'year' | 'all' | 'range'
export interface Period { mode: PeriodMode; year: number; month: number; from: string; to: string }

export function inPeriod(date: string, p: Period): boolean {
  switch (p.mode) {
    case 'month': return isInMonth(date, p.year, p.month)
    case 'year': return isInYear(date, p.year)
    case 'range': return (!p.from || date.slice(0, 10) >= p.from) && (!p.to || date.slice(0, 10) <= p.to)
    default: return true
  }
}

/** The period just before this one, for comparisons. */
export function previousPeriod(p: Period): Period | null {
  if (p.mode === 'month') return { ...p, year: p.month === 0 ? p.year - 1 : p.year, month: (p.month + 11) % 12 }
  if (p.mode === 'year') return { ...p, year: p.year - 1 }
  return null
}

export function supplierLabel(suppliers: Supplier[], id: number): string {
  const s = suppliers.find(x => x.id === id)
  return s ? s.supplier_name : 'No supplier'
}

export function supplierWithCategory(s: Supplier): string {
  return `${s.supplier_name} · ${CATEGORY_LABELS[s.supplier_category] ?? s.supplier_category}`
}

export function orderLabel(orders: Order[], id: string | null): string {
  if (!id) return ''
  const o = orders.find(x => x.id === id)
  return o?.company ? `${id} · ${o.company}` : id
}

/** Text a search matches against. */
export function searchText(r: LedgerRow, suppliers: Supplier[], orders: Order[]): string {
  return [r.header_id, r.description, r.name, r.category, r.unit, r.date,
    r.kind === 'production' ? supplierLabel(suppliers, r.supplier_id) : '',
    orderLabel(orders, r.order_id), String(r.total)].join(' ').toLowerCase()
}

/** Every search word must appear somewhere in the line. */
export function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every(w => text.includes(w))
}
