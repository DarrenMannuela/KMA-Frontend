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
// Shared parent ("Kas Bon") for both Production and Operation line items.
// A header is always exactly one Type — never mixed.
export type FinanceType = 'production' | 'operation'

export interface FinanceHeader {
  id: string          // e.g. "01/KB/26"
  type: FinanceType
  date: string         // ISO date string, e.g. "2026-04-02"
  supplier_id: number  // 0/unset is valid for operation headers with no supplier
  description: string
  supplier?: Supplier
}

// ─── Matches dto/ProductionItem.go ────────────────────────────────────────────
export interface ProductionItem {
  id: number
  header_id: string
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
// merged in — same shape the old flat Production/Operation types had. These
// are computed client-side in hooks/index.ts; they're not the wire format.
export interface ProductionRow {
  id: number                   // ProductionItem.id
  header_id: string            // e.g. "01/KB/26" — the Kas Bon id
  date: string
  description: string          // header-level description
  supplier_id: number
  supplier?: Supplier
  material_name: string        // item-level
  price: number                // item-level
  si_unit: string               // item-level
  amount: number                // item-level
}

export interface OperationRow {
  id: number                   // OperationItem.id
  header_id: string
  date: string
  description: string          // header-level description
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

export type CreateProductionItemRequest = Omit<ProductionItem, 'id'>
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