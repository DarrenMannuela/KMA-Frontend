import type { Supplier } from './supplier'

// ─── Matches dto/FinanceHeader.go ─────────────────────────────────────────────
// A Kas Bon: one receipt (id, date, description) holding production lines,
// operation lines, or both (e.g. fabric plus the ojek fee to fetch it).
export interface FinanceHeader {
  id: string          // e.g. "01/KB/26"
  date: string         // ISO date string, e.g. "2026-04-02"
  description: string
}

// ─── Matches dto/ProductionItem.go ────────────────────────────────────────────
// supplier_id lives HERE, not on the header — different material lines
// under the same Kas Bon can legitimately come from different suppliers.
export interface ProductionItem {
  id: number
  header_id: string
  supplier_id: number
  supplier?: Supplier
  material_name: string
  price: number
  si_unit: string     // e.g. "yard", "meter", "pcs"
  amount: number      // may be fractional: 2.5 meters
  order_id: string | null
}

// ─── Matches dto/OperationItem.go ─────────────────────────────────────────────
export interface OperationItem {
  id: number
  header_id: string
  category: string
  description: string
  price: number
  order_id: string | null
}

// ─── Rows as the pages show them: one per line, with its Kas Bon's fields ─────
export interface ProductionRow {
  id: number                   // ProductionItem.id
  header_id: string            // e.g. "01/KB/26" — the Kas Bon id
  date: string                 // header-level
  description: string          // header-level
  supplier_id: number          // item-level
  supplier?: Supplier          // item-level
  material_name: string        // item-level
  price: number                // item-level
  si_unit: string               // item-level
  amount: number                // item-level
  order_id: string | null       // item-level: the order this cost was for
}

export interface OperationRow {
  id: number                   // OperationItem.id
  header_id: string
  date: string                 // header-level
  description: string          // header-level
  category: string             // item-level — what OperationsDashboard/OperationsSpreadsheet group and filter by
  item_description: string     // item-level (the specific cost line)
  price: number                // item-level
  order_id: string | null      // item-level: the order this cost was for
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateFinanceHeaderRequest = FinanceHeader
export type UpdateFinanceHeaderRequest = Partial<CreateFinanceHeaderRequest>

export type CreateProductionItemRequest = Omit<ProductionItem, 'id' | 'supplier'>
export type UpdateProductionItemRequest = Partial<CreateProductionItemRequest>

export type CreateOperationItemRequest = Omit<OperationItem, 'id'>
export type UpdateOperationItemRequest = Partial<CreateOperationItemRequest>

// What the spreadsheet / quick-add UI submits — the hooks layer splits
// these into a FinanceHeader + item under the hood.
export type CreateProductionRowRequest = Omit<ProductionRow, 'id' | 'order_id'> & { order_id?: string | null }

export type CreateOperationRowRequest = Omit<OperationRow, 'id' | 'order_id'> & { order_id?: string | null }

// ─── Batch changes (POST /finance/batch), applied in one transaction ─────────
export interface ItemPatch {
  id: number
  fields: Record<string, unknown>
}

export interface FinanceBatch {
  new_headers?: FinanceHeader[]   // must not exist yet
  headers?: FinanceHeader[]       // created if missing
  header_update?: FinanceHeader[] // new date and description
  production_create?: Partial<ProductionItem>[]
  operation_create?: Partial<OperationItem>[]
  production_update?: ItemPatch[]
  operation_update?: ItemPatch[]
  production_delete?: number[]
  operation_delete?: number[]
}

export interface FinanceBatchResult {
  headers_created: FinanceHeader[] | null
  headers_deleted: FinanceHeader[] | null
  headers_before: FinanceHeader[] | null
  production: ProductionItem[] | null
  operation: OperationItem[] | null
  production_before: ProductionItem[] | null
  operation_before: OperationItem[] | null
  production_deleted: ProductionItem[] | null
  operation_deleted: OperationItem[] | null
}

// ─── Budgets and recurring costs ─────────────────────────────────────────────
export type BudgetScope = 'production' | 'operation'

/** A monthly limit for an operation category, a supplier category, or ""
 *  for the whole scope. */
export interface Budget {
  id: number
  scope: BudgetScope
  category: string
  amount: number
}

export interface RecurringCost {
  id: number
  category: string
  description: string
  price: number
  active: boolean
  last_posted: string   // "2026-10", or "" if never posted
}
