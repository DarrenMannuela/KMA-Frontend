import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ordersApi, itemsApi, invoicesApi, suppliersApi,
  financeHeaderApi, productionItemApi, operationItemApi,
  deliveryApi, deliveryItemApi,
  clientApi, clientContactApi, clientItemApi, clientItemPriceApi,
} from '@/api'
import type {
  FinanceHeader, ProductionItem, OperationItem, ProductionRow, OperationRow,
  CreateProductionRowRequest, UpdateProductionRowRequest,
  CreateOperationRowRequest, UpdateOperationRowRequest,
  UpdateFinanceHeaderRequest, UpdateProductionItemRequest, UpdateOperationItemRequest,
  Item, ClientItem, ClientItemPrice,
} from '@/types'

// ── generic CRUD hook factory (unchanged — used by orders/items/etc.) ────────
function makeCrudHooks<T, C, U>(
  key: string,
  api: {
    list: () => Promise<T[]>
    get: (id: string | number) => Promise<T>
    create: (b: C) => Promise<T>
    update: (id: string | number, b: U) => Promise<T>
    delete: (id: string | number) => Promise<unknown>
  },
  label: string
) {
  return {
    useList: () =>
      useQuery({ queryKey: [key], queryFn: api.list }),

    useGet: (id: string | number) =>
      useQuery({ queryKey: [key, id], queryFn: () => api.get(id), enabled: !!id }),

    useCreate: () => {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: (body: C) => api.create(body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: [key] }); toast.success(`${label} created`) },
        onError:   (e: Error) => toast.error(e.message),
      })
    },

    useUpdate: () => {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: ({ id, body }: { id: string | number; body: U }) => api.update(id, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: [key] }); toast.success(`${label} updated`) },
        onError:   (e: Error) => toast.error(e.message),
      })
    },

    useDelete: () => {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: (id: string | number) => api.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: [key] }); toast.success(`${label} deleted`) },
        onError:   (e: Error) => toast.error(e.message),
      })
    },
  }
}

export const orderHooks        = makeCrudHooks('orders',         ordersApi,        'Order')
export const itemHooks         = makeCrudHooks('items',          itemsApi,         'Item')
export const invoiceHooks        = makeCrudHooks('invoice',    invoicesApi,    'Invoice')
export const supplierHooks     = makeCrudHooks('suppliers',      suppliersApi,     'Supplier')
export const deliveryHooks     = makeCrudHooks('delivery',       deliveryApi,      'Delivery')
export const deliveryItemHooks = makeCrudHooks('delivery-orders', deliveryItemApi, 'Delivery item')

// ─────────────────────────────────────────────────────────────────────────────
// A DO's box contents are constrained by what was actually ordered — this
// computes, for every Item on an Order, how much has already gone out
// across ALL deliveries linked to that order (not just the one currently
// being edited), and what's left. Matching is by item_name+size since
// there's no order_item_id FK on DeliveryItem — same convention Items.go
// already uses to dedupe order items (see the comment in
// OrderDetailPage's ItemForm).
//
// excludeItemId lets a specific DeliveryItem's own amount be left out of
// the "already delivered" sum — used when editing that exact item, so its
// current amount doesn't count against itself when computing how much
// headroom is left.
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderRemainingItem extends Item {
  delivered: number
  remaining: number
}

export function useOrderRemainingItems(
  orderId: string | null | undefined,
  excludeItemId?: number
): OrderRemainingItem[] {
  const { data: orderItems = [] } = useQuery({
    queryKey: ['items', 'by-order', orderId],
    queryFn: () => itemsApi.getByOrder(orderId as string),
    enabled: !!orderId,
  })
  const { data: deliveries = [] } = deliveryHooks.useList()
  const { data: deliveryItems = [] } = deliveryItemHooks.useList()

  return useMemo(() => {
    if (!orderId) return []
    const deliveryIdsForOrder = new Set(
      deliveries.filter(d => d.order_id === orderId).map(d => d.id)
    )
    const deliveredMap = new Map<string, number>()
    deliveryItems.forEach(di => {
      if (di.id === excludeItemId) return
      if (!deliveryIdsForOrder.has(di.delivery_id)) return
      const key = `${di.item_name}|${di.size ?? ''}`
      deliveredMap.set(key, (deliveredMap.get(key) ?? 0) + di.amount)
    })
    return orderItems.map(oi => {
      const key = `${oi.item_name}|${oi.size ?? ''}`
      const delivered = deliveredMap.get(key) ?? 0
      return { ...oi, delivered, remaining: Math.max(0, oi.amount - delivered) }
    })
  }, [orderId, orderItems, deliveries, deliveryItems, excludeItemId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Production & Operations: FinanceHeader (parent) + items (children), flattened
// into rows client-side. Pages/spreadsheets keep using useList/useCreate/
// useUpdate/useDelete exactly as before — only what's inside changed.
//
// Headers no longer have a type or a supplier. A single Kas Bon can have
// BOTH production items and operation items on it (e.g. one receipt
// covering fabric plus the ojek fee to fetch it) — "is this header on the
// Production page" is purely "does it have ≥1 row in production_items",
// same idea for Operations. Supplier lives on ProductionItem now, so
// different material lines under the same Kas Bon can come from different
// suppliers — that's expected, not a conflict to warn about.
// ─────────────────────────────────────────────────────────────────────────────

const HEADERS_KEY = ['finance-header']
const PRODUCTION_ITEMS_KEY = ['production-item', 'grouped']
const OPERATION_ITEMS_KEY = ['operation-item', 'grouped']

// Raw FinanceHeader list — same query key as productionHooks.useList /
// operationHooks.useList below, so React Query dedupes this into their
// existing fetch rather than firing a new one. This is what Kas Bon ID
// auto-suggestion (Production/Operations quick-add) needs: the "NN/KB/YY"
// sequence is shared across both item types, and a header can exist with
// items in neither table yet (or only the other one), so deriving "IDs in
// use" from a single type's flattened rows would miss some and risk two
// quick-adds suggesting the same next number.
export function useFinanceHeaders() {
  return useQuery({ queryKey: HEADERS_KEY, queryFn: financeHeaderApi.list })
}

function toProductionRows(headers: FinanceHeader[], grouped: Record<string, ProductionItem[]>): ProductionRow[] {
  const rows: ProductionRow[] = []
  headers.forEach(h => {
    const items = grouped[h.id] ?? []
    // Headers with zero production items just don't appear on the
    // Production page — could be a pure-operations Kas Bon, or an
    // in-between state while a create is still in flight.
    items.forEach(item => rows.push({
      id: item.id, header_id: h.id, date: h.date, description: h.description,
      supplier_id: item.supplier_id, supplier: item.supplier,
      material_name: item.material_name, price: item.price, si_unit: item.si_unit, amount: item.amount,
    }))
  })
  return rows
}

function toOperationRows(headers: FinanceHeader[], grouped: Record<string, OperationItem[]>): OperationRow[] {
  const rows: OperationRow[] = []
  headers.forEach(h => {
    const items = grouped[h.id] ?? []
    // See comment in toProductionRows — headers with zero operation items
    // just don't appear here (could be a pure-production Kas Bon).
    items.forEach(item => rows.push({
      id: item.id, header_id: h.id, date: h.date, description: h.description,
      category: item.category, item_description: item.description, price: item.price,
    }))
  })
  return rows
}

export const productionHooks = {
  useList: () => {
    // Same query key as operationHooks.useList — React Query dedupes this
    // into a single fetch, since headers are no longer type-specific.
    const headers = useQuery({ queryKey: HEADERS_KEY, queryFn: financeHeaderApi.list })
    const items = useQuery({ queryKey: PRODUCTION_ITEMS_KEY, queryFn: productionItemApi.grouped })
    const data = useMemo(
      () => (headers.data && items.data) ? toProductionRows(headers.data, items.data) : [],
      [headers.data, items.data]
    )
    return { data, isLoading: headers.isLoading || items.isLoading }
  },

  // Creates the FinanceHeader (if this header_id doesn't exist yet) and the
  // ProductionItem in one call — the spreadsheet/quick-add UI just submits
  // a flat row and doesn't need to know about the two-table split.
  useCreate: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (row: CreateProductionRowRequest) => {
        const existingHeaders = qc.getQueryData<FinanceHeader[]>(HEADERS_KEY) ?? []
        const headerExists = existingHeaders.some(h => h.id === row.header_id)
        if (!headerExists) {
          // row.date is trusted here — the caller (Quick Add's Date field, or
          // the spreadsheet's "new Kas Bon" modal) is responsible for making
          // sure it's a real date before create.mutate is ever invoked, since
          // there's no per-row Date column to fall back on (date lives on the
          // header, not the item — see toProductionRows).
          const newHeader = await financeHeaderApi.create({
            id: row.header_id, date: row.date, description: row.description,
          })
          // Update the cache immediately rather than waiting for the
          // invalidate+refetch below — otherwise a second item added to the
          // same brand-new Kas Bon a moment later would still see "no
          // header yet" and try to create it again.
          qc.setQueryData<FinanceHeader[]>(HEADERS_KEY, (old = []) => [...old, newHeader])
        }
        // Supplier is an item-level field — no mismatch to check against
        // the header anymore, every line just carries its own.
        return productionItemApi.create({
          header_id: row.header_id, supplier_id: row.supplier_id, material_name: row.material_name,
          price: row.price, si_unit: row.si_unit, amount: row.amount,
        })
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry created')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  // A row edit may touch header fields (date/description), item fields
  // (material/price/unit/amount/supplier), or both — only the changed ones
  // are sent, each to its own table. Supplier now patches just this one
  // item, not the whole Kas Bon.
  useUpdate: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, body }: { id: number; body: UpdateProductionRowRequest }) => {
        const headerPatch: UpdateFinanceHeaderRequest = {}
        if (body.date !== undefined) headerPatch.date = body.date
        if (body.description !== undefined) headerPatch.description = body.description

        const itemPatch: UpdateProductionItemRequest = {}
        if (body.material_name !== undefined) itemPatch.material_name = body.material_name
        if (body.price !== undefined) itemPatch.price = body.price
        if (body.si_unit !== undefined) itemPatch.si_unit = body.si_unit
        if (body.amount !== undefined) itemPatch.amount = body.amount
        if (body.supplier_id !== undefined) itemPatch.supplier_id = body.supplier_id

        if (Object.keys(headerPatch).length > 0 && body.header_id) {
          await financeHeaderApi.update(body.header_id, headerPatch)
        }
        if (Object.keys(itemPatch).length > 0) {
          await productionItemApi.update(id, itemPatch)
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry updated')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  // Deletes the item. The header is only cleaned up if this was its last
  // item on BOTH sides — a header can carry operation items too now, so
  // being empty in production_items alone isn't enough to delete it.
  useDelete: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (id: number) => {
        const grouped = qc.getQueryData<Record<string, ProductionItem[]>>(PRODUCTION_ITEMS_KEY)
        const headerId = grouped
          ? Object.entries(grouped).find(([, items]) => items.some(i => i.id === id))?.[0]
          : undefined

        await productionItemApi.delete(id)

        if (headerId) {
          const remainingProductionItems = (grouped![headerId] ?? []).filter(i => i.id !== id)
          const operationGrouped = qc.getQueryData<Record<string, OperationItem[]>>(OPERATION_ITEMS_KEY)
          const stillHasOperationItems = (operationGrouped?.[headerId]?.length ?? 0) > 0
          if (remainingProductionItems.length === 0 && !stillHasOperationItems) {
            await financeHeaderApi.delete(headerId).catch(() => {})
          }
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry deleted')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },
}

export const operationHooks = {
  useList: () => {
    // Same query key as productionHooks.useList — dedupes to one fetch.
    const headers = useQuery({ queryKey: HEADERS_KEY, queryFn: financeHeaderApi.list })
    const items = useQuery({ queryKey: OPERATION_ITEMS_KEY, queryFn: operationItemApi.grouped })
    const data = useMemo(
      () => (headers.data && items.data) ? toOperationRows(headers.data, items.data) : [],
      [headers.data, items.data]
    )
    return { data, isLoading: headers.isLoading || items.isLoading }
  },

  useCreate: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (row: CreateOperationRowRequest) => {
        const existingHeaders = qc.getQueryData<FinanceHeader[]>(HEADERS_KEY) ?? []
        const headerExists = existingHeaders.some(h => h.id === row.header_id)
        if (!headerExists) {
          // See productionHooks.useCreate — row.date is trusted here, made
          // meaningful by the caller (Quick Add or the spreadsheet's "new
          // Kas Bon" modal) before this mutation ever runs.
          const newHeader = await financeHeaderApi.create({
            id: row.header_id, date: row.date, description: row.description,
          })
          qc.setQueryData<FinanceHeader[]>(HEADERS_KEY, (old = []) => [...old, newHeader])
        }
        return operationItemApi.create({ header_id: row.header_id, category: row.category, description: row.item_description, price: row.price })
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
        toast.success('Operation entry created')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  useUpdate: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, body }: { id: number; body: UpdateOperationRowRequest }) => {
        const headerPatch: UpdateFinanceHeaderRequest = {}
        if (body.date !== undefined) headerPatch.date = body.date
        if (body.description !== undefined) headerPatch.description = body.description

        const itemPatch: UpdateOperationItemRequest = {}
        if (body.item_description !== undefined) itemPatch.description = body.item_description
        if (body.category !== undefined) itemPatch.category = body.category
        if (body.price !== undefined) itemPatch.price = body.price

        if (Object.keys(headerPatch).length > 0 && body.header_id) {
          await financeHeaderApi.update(body.header_id, headerPatch)
        }
        if (Object.keys(itemPatch).length > 0) {
          await operationItemApi.update(id, itemPatch)
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
        toast.success('Operation entry updated')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  // Same cross-table orphan check as productionHooks.useDelete, mirrored.
  useDelete: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (id: number) => {
        const grouped = qc.getQueryData<Record<string, OperationItem[]>>(OPERATION_ITEMS_KEY)
        const headerId = grouped
          ? Object.entries(grouped).find(([, items]) => items.some(i => i.id === id))?.[0]
          : undefined

        await operationItemApi.delete(id)

        if (headerId) {
          const remainingOperationItems = (grouped![headerId] ?? []).filter(i => i.id !== id)
          const productionGrouped = qc.getQueryData<Record<string, ProductionItem[]>>(PRODUCTION_ITEMS_KEY)
          const stillHasProductionItems = (productionGrouped?.[headerId]?.length ?? 0) > 0
          if (remainingOperationItems.length === 0 && !stillHasProductionItems) {
            await financeHeaderApi.delete(headerId).catch(() => {})
          }
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: HEADERS_KEY })
        qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
        toast.success('Operation entry deleted')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients: a client's independent catalogue (ClientItem) and its
// year-by-year prices (ClientItemPrice) are separate tables — unlike
// Production/Operations there's no shared "header" to auto-create, so
// these stay plain CRUD via makeCrudHooks. React Query's key matching is
// prefix-based, so invalidating e.g. ['client-items'] also invalidates
// ['client-items', 'by-client', someId] below — no manual cross-key
// invalidation needed the way productionHooks/operationHooks require.
// ─────────────────────────────────────────────────────────────────────────────

export const clientHooks = makeCrudHooks('clients', clientApi, 'Client')

export const clientContactHooks = {
  ...makeCrudHooks('client-contacts', clientContactApi, 'Contact'),
  // Powers the client detail page's POC list.
  useByClient: (clientId: number | undefined) =>
    useQuery({
      queryKey: ['client-contacts', 'by-client', clientId],
      queryFn: () => clientContactApi.getByClient(clientId as number),
      enabled: clientId !== undefined,
    }),
}

export const clientItemHooks = {
  ...makeCrudHooks('client-items', clientItemApi, 'Item'),
  // Powers the client detail page's catalogue list.
  useByClient: (clientId: number | undefined) =>
    useQuery({
      queryKey: ['client-items', 'by-client', clientId],
      queryFn: () => clientItemApi.getByClient(clientId as number),
      enabled: clientId !== undefined,
    }),
  useUploadPhoto: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => clientItemApi.uploadPhoto(id, file),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-items'] }); toast.success('Photo uploaded') },
      onError:   (e: Error) => toast.error(e.message),
    })
  },
  useDeletePhoto: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (id: number) => clientItemApi.deletePhoto(id),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-items'] }); toast.success('Photo removed') },
      onError:   (e: Error) => toast.error(e.message),
    })
  },
}

export const clientItemPriceHooks = {
  ...makeCrudHooks('client-item-prices', clientItemPriceApi, 'Price'),
  // { [client_item_id]: Price[] } for every item across every client — the
  // same "grouped" shape as productionItemApi/operationItemApi, so a
  // client's whole catalogue history loads in one request.
  useGrouped: () =>
    useQuery({ queryKey: ['client-item-prices', 'grouped'], queryFn: clientItemPriceApi.grouped }),
  useByItem: (clientItemId: number | undefined) =>
    useQuery({
      queryKey: ['client-item-prices', 'by-item', clientItemId],
      queryFn: () => clientItemPriceApi.getByItem(clientItemId as number),
      enabled: clientItemId !== undefined,
    }),
}

// One client's full year-by-year price history, flattened for the
// spreadsheet — item_name/size ride along from ClientItem the same way a
// header's date/description ride along on ProductionRow, so the
// spreadsheet can show "what" next to "how much, which year" without a
// second lookup per row.
export interface ClientItemPriceRow extends ClientItemPrice {
  item_name: string
  size: string | null
}

function toClientItemPriceRows(items: ClientItem[], grouped: Record<string, ClientItemPrice[]>): ClientItemPriceRow[] {
  const rows: ClientItemPriceRow[] = []
  items.forEach(item => {
    const prices = grouped[String(item.id)] ?? []
    prices.forEach(p => rows.push({ ...p, item_name: item.item_name, size: item.size }))
  })
  return rows.sort((a, b) => a.item_name.localeCompare(b.item_name) || a.year - b.year)
}

export function useClientCatalogueRows(clientId: number | undefined) {
  const items = clientItemHooks.useByClient(clientId)
  const grouped = clientItemPriceHooks.useGrouped()
  const data = useMemo(
    () => (items.data && grouped.data) ? toClientItemPriceRows(items.data, grouped.data) : [],
    [items.data, grouped.data]
  )
  return { data, isLoading: items.isLoading || grouped.isLoading }
}