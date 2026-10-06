import axios from 'axios'
import { handleSessionExpired } from '@/api/authApi'
import type {
  Order, Item, Invoice, Supplier, FinanceHeader, ProductionItem, OperationItem,
  FinanceBatch, FinanceBatchResult, Budget, RecurringCost,
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

// Base URL: nginx (and Vite in dev) proxies /api/v1 to the Go server on :8000.

// Thrown for any failed request to the main API, with the HTTP status so
// callers can branch on it (e.g. 409 on a duplicate order ID).
export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const http = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (r) => r,
  (e) => {
    // The backend's session check failed: same handling as a 401 from the auth service.
    if (e.response?.status === 401) handleSessionExpired(e.config?.url)
    return Promise.reject(new ApiError(
      e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? 'Error',
      e.response?.status
    ))
  }
)

// ── Generic CRUD factory ──────────────────────────────────────────────────────
// Uses PATCH for updates (matching the Go handlers and OpenAPI spec).
function crud<T, C, U>(base: string) {
  return {
    list:   ()                    => http.get<T[]>(base).then(r => r.data),
    get:    (id: string | number) => http.get<T>(`${base}/${encodeURIComponent(id)}`).then(r => r.data),
    create: (body: C)             => http.post<T>(base, body).then(r => r.data),
    // PATCH — matches the Go handlers and OpenAPI spec
    update: (id: string | number, body: U) => http.patch<T>(`${base}/${encodeURIComponent(id)}`, body).then(r => r.data),
    delete: (id: string | number) => http.delete(`${base}/${encodeURIComponent(id)}`).then(r => r.data),
  }
}

// ── Endpoints (see main.go for the full route table) ────────────────────────

export const ordersApi        = crud<Order,         CreateOrderRequest,        UpdateOrderRequest>('/order')
export const itemsApi         = {...crud<Item,           CreateItemRequest,          UpdateItemRequest>('/item'), getByOrder: (orderId: string) => http.get<Item[]>(`/item/by-order?order_id=${encodeURIComponent(orderId)}`).then(r => r.data)}
export const invoicesApi    = crud<Invoice,     CreateInvoiceRequest,    UpdateInvoiceRequest>('/invoice')
export const suppliersApi     = crud<Supplier,       CreateSupplierRequest,      UpdateSupplierRequest>('/supplier')

// The Kas Bon headers. One header can hold production and operation lines.
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

export const financeBatchApi = {
  apply: (batch: FinanceBatch) => http.post<FinanceBatchResult>('/finance/batch', batch).then(r => r.data),
}

export const budgetApi = {
  list: () => http.get<Budget[]>('/budget').then(r => r.data),
  /** An amount of 0 removes the budget. */
  put: (b: Omit<Budget, 'id'>) => http.put<Budget>('/budget', b).then(r => r.data),
}

export const recurringCostApi = {
  ...crud<RecurringCost, Omit<RecurringCost, 'id'>, Partial<RecurringCost>>('/recurring-cost'),
  postMonth: (body: { month: string; header_id: string; date: string }) =>
    http.post<{ posted: OperationItem[] | null }>('/recurring-cost/post-month', body).then(r => r.data),
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

// Price history per catalogue item; grouped() returns { [client_item_id]: Price[] }.
export const clientItemPriceApi = {
  ...crud<ClientItemPrice, CreateClientItemPriceRequest, UpdateClientItemPriceRequest>('/client-item-price'),
  getByItem: (clientItemId: number | string) =>
    http.get<ClientItemPrice[]>(`/client-item-price/by-item?client_item_id=${encodeURIComponent(clientItemId)}`).then(r => r.data),
  grouped: () => http.get<Record<string, ClientItemPrice[]>>('/client-item-price/grouped').then(r => r.data),
}