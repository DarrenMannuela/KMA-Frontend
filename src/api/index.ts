import axios from 'axios'
import type {
  Order, Item, Invoice, Supplier, FinanceHeader, FinanceType, ProductionItem, OperationItem,
  Delivery, DeliveryItem,
  CreateOrderRequest, UpdateOrderRequest,
  CreateItemRequest, UpdateItemRequest,
  CreateInvoiceRequest, UpdateInvoiceRequest,
  CreateSupplierRequest, UpdateSupplierRequest,
  CreateFinanceHeaderRequest, UpdateFinanceHeaderRequest,
  CreateProductionItemRequest, UpdateProductionItemRequest,
  CreateOperationItemRequest, UpdateOperationItemRequest,
  CreateDeliveryRequest, UpdateDeliveryRequest,
  CreateDeliveryItemRequest, UpdateDeliveryItemRequest,
} from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Base URL: Vite proxies /api/v1 → http://localhost:8000/api/v1
// See vite.config.ts proxy config.
// Port is 8000 (Go server) — not 8080.
// ─────────────────────────────────────────────────────────────────────────────
const http = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (r) => r,
  (e) => Promise.reject(new Error(
    e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? 'Error'
  ))
)

// ── Generic CRUD factory ──────────────────────────────────────────────────────
// Uses PATCH for updates (matching the Go handlers and OpenAPI spec).
// Some routes are still stubs in main.go — see STUB comments below.
function crud<T, C, U>(base: string) {
  return {
    list:   ()                    => http.get<T[]>(base).then(r => r.data),
    get:    (id: string | number) => http.get<T>(`${base}/${encodeURIComponent(id)}`).then(r => r.data),
    create: (body: C)             => http.post<T>(base, body).then(r => r.data),
    // PATCH — matches supplier handler and OpenAPI spec
    update: (id: string | number, body: U) => http.patch<T>(`${base}/${encodeURIComponent(id)}`, body).then(r => r.data),
    delete: (id: string | number) => http.delete(`${base}/${encodeURIComponent(id)}`).then(r => r.data),
  }
}

// ── Route mapping (exact paths from main.go + kma.yaml) ──────────────────────
//
//  LIVE (wired to real handlers):
//    /supplier, /supplier/:id
//    /finance-header, /finance-header/:id  (shared parent for Production/Operation Kas Bons)
//    /production-item, /production-item/:id
//    /operation-item, /operation-item/:id
//
//  STUB (returns placeholder JSON — not wired to DB yet):
//    /order, /order/:id
//    /items, /items/:id
//    /order-recap, /order-recap/:id
//    /delivery, /delivery/:id
//    /delivery-order, /delivery-order/:id
//    /surat-jalan, /surat-jalan/:id
//
//  NOT YET IN main.go (will need to be added as routes are implemented):
//    /:id variants for order, items, surat-jalan
// ─────────────────────────────────────────────────────────────────────────────

export const ordersApi        = crud<Order,         CreateOrderRequest,        UpdateOrderRequest>('/order')
export const itemsApi         = {...crud<Item,           CreateItemRequest,          UpdateItemRequest>('/item'), getByOrder: (orderId: string) => http.get<Item[]>(`/item/by-order?order_id=${encodeURIComponent(orderId)}`).then(r => r.data)}
export const invoicesApi    = crud<Invoice,     CreateInvoiceRequest,    UpdateInvoiceRequest>('/invoice')
export const suppliersApi     = crud<Supplier,       CreateSupplierRequest,      UpdateSupplierRequest>('/supplier')

// financeHeaderApi: the shared "Kas Bon" parent. listByType is what the
// production/operations pages actually use — a plain list() would mix both.
export const financeHeaderApi = {
  ...crud<FinanceHeader, CreateFinanceHeaderRequest, UpdateFinanceHeaderRequest>('/finance-header'),
  listByType: (type: FinanceType) =>
    http.get<FinanceHeader[]>(`/finance-header?type=${type}`).then(r => r.data),
}

// productionItemApi / operationItemApi: the line items under a header.
// grouped() returns { [headerId]: Item[] } — the shape the row-flattening
// hooks in hooks/index.ts expect.
export const productionItemApi = {
  ...crud<ProductionItem, CreateProductionItemRequest, UpdateProductionItemRequest>('/production-item'),
  grouped: () => http.get<Record<string, ProductionItem[]>>('/production-item/grouped').then(r => r.data),
}

export const operationItemApi = {
  ...crud<OperationItem, CreateOperationItemRequest, UpdateOperationItemRequest>('/operation-item'),
  grouped: () => http.get<Record<string, OperationItem[]>>('/operation-item/grouped').then(r => r.data),
}

export const deliveryApi      = crud<Delivery,       CreateDeliveryRequest,      UpdateDeliveryRequest>('/delivery')
export const deliveryItemApi = crud<DeliveryItem,  CreateDeliveryItemRequest, UpdateDeliveryItemRequest>('/delivery-item')