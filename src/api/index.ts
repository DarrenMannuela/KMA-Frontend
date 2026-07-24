import axios from 'axios'
import type {
  Order, Item, Invoice, Supplier, FinanceHeader, ProductionItem, OperationItem,
  Delivery, DeliveryItem, Client, ClientContact, ClientItem, ClientItemPrice,
  CreateOrderRequest, UpdateOrderRequest,
  CreateItemRequest, UpdateItemRequest,
  CreateInvoiceRequest, UpdateInvoiceRequest,
  CreateSupplierRequest, UpdateSupplierRequest,
  CreateFinanceHeaderRequest, UpdateFinanceHeaderRequest,
  CreateProductionItemRequest, UpdateProductionItemRequest,
  CreateOperationItemRequest, UpdateOperationItemRequest,
  CreateDeliveryRequest, UpdateDeliveryRequest,
  CreateDeliveryItemRequest, UpdateDeliveryItemRequest,
  CreateClientRequest, UpdateClientRequest,
  CreateClientContactRequest, UpdateClientContactRequest,
  CreateClientItemRequest, UpdateClientItemRequest,
  CreateClientItemPriceRequest, UpdateClientItemPriceRequest,
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
//    /finance-header, /finance-header/:id  (shared parent for Production/Operation Kas Bons —
//      no longer filterable by type; a header can have both production and
//      operation items attached, so listing is just "give me all headers")
//    /production-item, /production-item/:id  (now carries its own supplier_id)
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
//
//  CLIENTS SUBSECTION (verified against main.go):
//    /client, /client/:id
//    /client-contact, /client-contact/:id, /client-contact/by-client?client_id=
//    /client-item, /client-item/:id, /client-item/by-client?client_id=
//    /client-item/:id/photo  (POST multipart "photo", DELETE)
//    /client-item-price, /client-item-price/:id,
//      /client-item-price/by-item?client_item_id=, /client-item-price/grouped
// ─────────────────────────────────────────────────────────────────────────────

export const ordersApi        = crud<Order,         CreateOrderRequest,        UpdateOrderRequest>('/order')
export const itemsApi         = {...crud<Item,           CreateItemRequest,          UpdateItemRequest>('/item'), getByOrder: (orderId: string) => http.get<Item[]>(`/item/by-order?order_id=${encodeURIComponent(orderId)}`).then(r => r.data)}
export const invoicesApi    = crud<Invoice,     CreateInvoiceRequest,    UpdateInvoiceRequest>('/invoice')
export const suppliersApi     = crud<Supplier,       CreateSupplierRequest,      UpdateSupplierRequest>('/supplier')

// financeHeaderApi: the shared "Kas Bon" parent. Plain list() is now what
// production/operations actually use — there's no type filter anymore,
// since a single header can have both production and operation items on
// it. Each page's hooks (productionHooks/operationHooks) filter down to
// "headers that actually have an item in my table" client-side instead.
export const financeHeaderApi = crud<FinanceHeader, CreateFinanceHeaderRequest, UpdateFinanceHeaderRequest>('/finance-header')

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

// ── Clients subsection ────────────────────────────────────────────────────────
// clientApi: the company/client record itself.
export const clientApi = crud<Client, CreateClientRequest, UpdateClientRequest>('/client')

// clientContactApi: one client's POCs. getByClient() powers the client
// detail page's POC list, same shape as itemsApi.getByOrder.
export const clientContactApi = {
  ...crud<ClientContact, CreateClientContactRequest, UpdateClientContactRequest>('/client-contact'),
  getByClient: (clientId: number | string) =>
    http.get<ClientContact[]>(`/client-contact/by-client?client_id=${encodeURIComponent(clientId)}`).then(r => r.data),
}

// clientItemApi: one client's catalogue. getByClient() powers the client
// detail page's catalogue list. uploadPhoto/deletePhoto hit the dedicated
// photo endpoints (multipart form, field name "photo").
export const clientItemApi = {
  ...crud<ClientItem, CreateClientItemRequest, UpdateClientItemRequest>('/client-item'),
  getByClient: (clientId: number | string) =>
    http.get<ClientItem[]>(`/client-item/by-client?client_id=${encodeURIComponent(clientId)}`).then(r => r.data),
  uploadPhoto: (id: number | string, file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return http.post<ClientItem>(`/client-item/${encodeURIComponent(id)}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  deletePhoto: (id: number | string) =>
    http.delete<ClientItem>(`/client-item/${encodeURIComponent(id)}/photo`).then(r => r.data),
}

// clientItemPriceApi: year-by-year price history per catalogue item.
// grouped() returns { [client_item_id]: Price[] }, same "grouped" shape
// as productionItemApi/operationItemApi — lets a client's whole catalogue
// render its price history in one request instead of one per item.
export const clientItemPriceApi = {
  ...crud<ClientItemPrice, CreateClientItemPriceRequest, UpdateClientItemPriceRequest>('/client-item-price'),
  getByItem: (clientItemId: number | string) =>
    http.get<ClientItemPrice[]>(`/client-item-price/by-item?client_item_id=${encodeURIComponent(clientItemId)}`).then(r => r.data),
  grouped: () => http.get<Record<string, ClientItemPrice[]>>('/client-item-price/grouped').then(r => r.data),
}