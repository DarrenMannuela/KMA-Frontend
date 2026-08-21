import type { Supplier } from './supplier'

// ─── Matches dto/FinanceHeader.go ─────────────────────────────────────────────
// A "Kas Bon" — shared parent for Production and/or Operation line items.
// Deliberately just a receipt: id/date/description. It does NOT carry a
// type or a supplier anymore. Whether a header shows up on the Production
// page, the Operations page, or both, is purely a function of which item
// tables actually have rows pointing at it (see toProductionRows /
// toOperationRows in hooks/index.ts) — a single Kas Bon can legitimately
// have both production material lines AND an operation cost line on it,
// e.g. one physical receipt covering fabric plus the ojek fee to fetch it.
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
  amount: number
}

// ─── Matches dto/OperationItem.go ─────────────────────────────────────────────
export interface OperationItem {
  id: number
  header_id: string
  category: string
  description: string
  price: number
}

// ─── Flattened view-models ─────────────────────────────────────────────────────
// The spreadsheets show one row per item with its parent header's fields
// merged in. These are computed client-side in hooks/index.ts; they're not
// the wire format.
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
}

export interface OperationRow {
  id: number                   // OperationItem.id
  header_id: string
  date: string                 // header-level
  description: string          // header-level
  category: string             // item-level — what OperationsDashboard/OperationsSpreadsheet group and filter by
  item_description: string     // item-level (the specific cost line)
  price: number                // item-level
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
export type CreateProductionRowRequest = Omit<ProductionRow, 'id'>
export type UpdateProductionRowRequest = Partial<CreateProductionRowRequest>

export type CreateOperationRowRequest = Omit<OperationRow, 'id'>
export type UpdateOperationRowRequest = Partial<CreateOperationRowRequest>
