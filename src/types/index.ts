// ─── Matches dto/Orders.go ────────────────────────────────────────────────────
export interface Order {
  id: string          // e.g. "001/KMA/25"
  company: string | null
  po_number: string | null
  date: string        // ISO date string
}

// ─── Matches dto/Items.go ─────────────────────────────────────────────────────
// Note: order_id is a string in the OpenAPI spec (e.g. "001/KMA/25")
export interface Item {
  id: number
  order_id: string    // matches Orders.id — string ID like "001/KMA/25"
  item_name: string
  size: string | null
  amount: number
  price: number
  sub_total: number
}

// ─── Matches dto/Invoice.go ────────────────────────────────────────────────
export interface Invoice {
  id: string
  order_id: string
  type: string
  kepada_yth: string
  untuk: string
  alamat: string
  email: string | null
  telp: string | null
  start_produksi: string | null
  lama_produksi: string | null
  total: number
  down_payment: number | null
  discount: number | null
  remaining: number
  ar_receivable: number
  tanggal: string
  due_date: string | null
  paid_date: string | null
  status: string
}

// ─── Supplier category enum from kma.yaml ────────────────────────────────────
export type SupplierCategory =
  | 'sablon'
  | 'embroidery'
  | 'merchandise_supplier'
  | 'uniform_supplier'
  | 'general_supplier'

// ─── Matches dto/Supplier.go ──────────────────────────────────────────────────
export interface Supplier {
  id: number
  supplier_name: string
  supplier_category: SupplierCategory
}

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
  item_description: string     // item-level (the specific cost line)
  price: number                // item-level
}

// ─── Matches dto/Delivery.go ─────────────────────────────────────────────────
export interface Delivery {
  id: string
  type: string        
  address: string
  po_number: string | null
  phone_number: string | null
  contact_person: string | null
  date: string
}

// ─── Matches dto/DeliveryItem.go ────────────────────────────────────────────
export interface DeliveryItem {
  id: number
  delivery_id: string
  item_name: string
  size: string | null
  amount: number
  boxnumber: number| null
  delivery?: Delivery
}


// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateOrderRequest = Order
export type UpdateOrderRequest = Partial<CreateOrderRequest>

export type CreateItemRequest = Omit<Item, 'id'>
export type UpdateItemRequest = Partial<CreateItemRequest>

export type CreateInvoiceRequest = Omit<Invoice, 'remaining' | 'ar_receivable'> & {
  remaining?: number
  ar_receivable?: number
}
export type UpdateInvoiceRequest = Partial<CreateInvoiceRequest>

export type CreateSupplierRequest = Omit<Supplier, 'id'>
export type UpdateSupplierRequest = Partial<CreateSupplierRequest>

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

export type CreateDeliveryRequest = Delivery
export type UpdateDeliveryRequest = Partial<CreateDeliveryRequest>

export type CreateDeliveryItemRequest = Omit<DeliveryItem, 'id' | 'delivery'>
export type UpdateDeliveryItemRequest = Partial<CreateDeliveryItemRequest>

// ─── UI helpers ───────────────────────────────────────────────────────────────
export type PageName =
  | 'dashboard'
  | 'orders'
  | 'items'
  | 'invoice'
  | 'delivery'
  | 'delivery-items'
  | 'production'
  | 'suppliers'
  | 'operations'