import axios from 'axios'
import type {
  Order, Item, OrderRecap, Supplier, Production, Operation,
  Delivery, DeliveryOrder, SuratJalan,
  CreateOrderRequest, UpdateOrderRequest,
  CreateItemRequest, UpdateItemRequest,
  CreateOrderRecapRequest, UpdateOrderRecapRequest,
  CreateSupplierRequest, UpdateSupplierRequest,
  CreateProductionRequest, UpdateProductionRequest,
  CreateOperationRequest, UpdateOperationRequest,
  CreateDeliveryRequest, UpdateDeliveryRequest,
  CreateDeliveryOrderRequest, UpdateDeliveryOrderRequest,
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
//
//  STUB (returns placeholder JSON — not wired to DB yet):
//    /order, /order/:id
//    /items, /items/:id
//    /order-recap, /order-recap/:id
//    /delivery, /delivery/:id
//    /delivery-order, /delivery-order/:id
//    /surat-jalan, /surat-jalan/:id
//    /production-entry, /production-entry/:id
//    /operation-entry, /operation-entry/:id
//
//  NOT YET IN main.go (will need to be added as routes are implemented):
//    /:id variants for order, items, surat-jalan
// ─────────────────────────────────────────────────────────────────────────────

export const ordersApi        = crud<Order,         CreateOrderRequest,        UpdateOrderRequest>('/order')
export const itemsApi         = {...crud<Item,           CreateItemRequest,          UpdateItemRequest>('/item'), getByOrder: (orderId: string) => http.get<Item[]>(`/item?order_id=${encodeURIComponent(orderId)}`).then(r => r.data)}
export const orderRecapApi    = crud<OrderRecap,     CreateOrderRecapRequest,    UpdateOrderRecapRequest>('/order-recap')
export const suppliersApi     = crud<Supplier,       CreateSupplierRequest,      UpdateSupplierRequest>('/supplier')
export const productionApi    = crud<Production,     CreateProductionRequest,    UpdateProductionRequest>('/production')
export const operationsApi    = crud<Operation,      CreateOperationRequest,     UpdateOperationRequest>('/operation')
export const deliveryApi      = crud<Delivery,       CreateDeliveryRequest,      UpdateDeliveryRequest>('/delivery')
export const deliveryOrderApi = crud<DeliveryOrder,  CreateDeliveryOrderRequest, UpdateDeliveryOrderRequest>('/delivery-order')
export const suratJalanApi    = crud<SuratJalan,     Partial<SuratJalan>,        Partial<SuratJalan>>('/surat-jalan')
