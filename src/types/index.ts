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

// ─── Matches dto/OrderRecap.go ────────────────────────────────────────────────
export interface OrderRecap {
  id: string          // e.g. "001/KMA/25"
  order_id: number
  total: number
  down_payment: number | null
  discount: number | null
  amount: number
  remaining: number
  ar_receivable: number
  orders?: Order
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

// ─── Matches dto/Production.go ────────────────────────────────────────────────
export interface Production {
  id: string          // e.g. "01/KB/26"
  description: string
  supplier_id: number
  material_name: string
  price: number
  si_unit: string     // e.g. "yard", "meter", "pcs"
  amount: number
  supplier?: Supplier
}

// ─── Matches dto/Operations.go ────────────────────────────────────────────────
export interface Operation {
  id: string          // e.g. "01/KB/26"
  description: string
  price: number
}

// ─── Matches dto/Delivery.go ─────────────────────────────────────────────────
export interface Delivery {
  id: string          // e.g. "001/KMA/25"
  address: string
  po_number: string | null
  phone_number: string | null
  contact_person: string | null
  date: string        // ISO date string
}

// ─── Matches dto/DeliveryOrder.go ────────────────────────────────────────────
export interface DeliveryOrder {
  id: number
  delivery_id: string
  item_name: string
  size: string | null
  amount: number
  delivery?: Delivery
}

// ─── Matches dto/SuratJalan.go ────────────────────────────────────────────────
export interface SuratJalan {
  id: number
  delivery_id: number
  delivery_items: string[]
  size: (string | null)[]
  amount: number
  delivery?: Delivery
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateOrderRequest = Omit<Order, 'id'>
export type UpdateOrderRequest = Partial<CreateOrderRequest>

export type CreateItemRequest = Omit<Item, 'id'>
export type UpdateItemRequest = Partial<CreateItemRequest>

export type CreateOrderRecapRequest = Omit<OrderRecap, 'id' | 'orders'>
export type UpdateOrderRecapRequest = Partial<CreateOrderRecapRequest>

export type CreateSupplierRequest = Omit<Supplier, 'id'>
export type UpdateSupplierRequest = Partial<CreateSupplierRequest>

export type CreateProductionRequest = Omit<Production, 'supplier'>
export type UpdateProductionRequest = Partial<CreateProductionRequest>

export type CreateOperationRequest = Omit<Operation, 'id'>
export type UpdateOperationRequest = Partial<CreateOperationRequest>

export type CreateDeliveryRequest = Omit<Delivery, 'id'>
export type UpdateDeliveryRequest = Partial<CreateDeliveryRequest>

export type CreateDeliveryOrderRequest = Omit<DeliveryOrder, 'id' | 'delivery'>
export type UpdateDeliveryOrderRequest = Partial<CreateDeliveryOrderRequest>

// ─── UI helpers ───────────────────────────────────────────────────────────────
export type PageName =
  | 'dashboard'
  | 'orders'
  | 'items'
  | 'order-recap'
  | 'delivery'
  | 'delivery-orders'
  | 'surat-jalan'
  | 'production'
  | 'suppliers'
  | 'operations'
