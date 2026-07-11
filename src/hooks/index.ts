import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ordersApi, itemsApi, invoicesApi, suppliersApi,
  financeHeaderApi, productionItemApi, operationItemApi,
  deliveryApi, deliveryItemApi,
} from '@/api'
import type {
  FinanceHeader, ProductionItem, OperationItem, ProductionRow, OperationRow,
  CreateProductionRowRequest, UpdateProductionRowRequest,
  CreateOperationRowRequest, UpdateOperationRowRequest,
  UpdateFinanceHeaderRequest, UpdateProductionItemRequest, UpdateOperationItemRequest,
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
// Production & Operations: FinanceHeader (parent) + items (children), flattened
// into rows client-side. Pages/spreadsheets keep using useList/useCreate/
// useUpdate/useDelete exactly as before — only what's inside changed.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTION_HEADERS_KEY = ['finance-header', 'production']
const PRODUCTION_ITEMS_KEY = ['production-item', 'grouped']
const OPERATION_HEADERS_KEY = ['finance-header', 'operation']
const OPERATION_ITEMS_KEY = ['operation-item', 'grouped']

function toProductionRows(headers: FinanceHeader[], grouped: Record<string, ProductionItem[]>): ProductionRow[] {
  const rows: ProductionRow[] = []
  headers.forEach(h => {
    const items = grouped[h.id] ?? []
    // A header with zero items shouldn't normally happen — useCreate always
    // makes header+item together — but if it ever does, just skip it rather
    // than fabricate a row with no real item id (SpreadsheetView expects
    // every row in `data` to have a real, persisted id).
    items.forEach(item => rows.push({
      id: item.id, header_id: h.id, date: h.date, description: h.description,
      supplier_id: h.supplier_id, supplier: h.supplier,
      material_name: item.material_name, price: item.price, si_unit: item.si_unit, amount: item.amount,
    }))
  })
  return rows
}

function toOperationRows(headers: FinanceHeader[], grouped: Record<string, OperationItem[]>): OperationRow[] {
  const rows: OperationRow[] = []
  headers.forEach(h => {
    const items = grouped[h.id] ?? []
    // See comment in toProductionRows — headers with zero items are skipped.
    items.forEach(item => rows.push({
      id: item.id, header_id: h.id, date: h.date, description: h.description,
      item_description: item.description, price: item.price,
    }))
  })
  return rows
}

export const productionHooks = {
  useList: () => {
    const headers = useQuery({ queryKey: PRODUCTION_HEADERS_KEY, queryFn: () => financeHeaderApi.listByType('production') })
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
        const existingHeaders = qc.getQueryData<FinanceHeader[]>(PRODUCTION_HEADERS_KEY) ?? []
        const headerExists = existingHeaders.some(h => h.id === row.header_id)
        if (!headerExists) {
          // row.date is trusted here — the caller (Quick Add's Date field, or
          // the spreadsheet's "new Kas Bon" modal) is responsible for making
          // sure it's a real date before create.mutate is ever invoked, since
          // there's no per-row Date column to fall back on (date lives on the
          // header, not the item — see toProductionRows).
          const newHeader = await financeHeaderApi.create({
            id: row.header_id, type: 'production', date: row.date,
            supplier_id: row.supplier_id, description: row.description,
          })
          // Update the cache immediately rather than waiting for the
          // invalidate+refetch below — otherwise a second item added to the
          // same brand-new Kas Bon a moment later would still see "no
          // header yet" and try to create it again.
          qc.setQueryData<FinanceHeader[]>(PRODUCTION_HEADERS_KEY, (old = []) => [...old, newHeader])
        }
        return productionItemApi.create({
          header_id: row.header_id, material_name: row.material_name,
          price: row.price, si_unit: row.si_unit, amount: row.amount,
        })
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: PRODUCTION_HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry created')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  // A row edit may touch header fields (date/description/supplier), item
  // fields (material/price/unit/amount), or both — only the changed ones
  // are sent, each to its own table.
  useUpdate: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, body }: { id: number; body: UpdateProductionRowRequest }) => {
        const headerPatch: UpdateFinanceHeaderRequest = {}
        if (body.date !== undefined) headerPatch.date = body.date
        if (body.description !== undefined) headerPatch.description = body.description
        if (body.supplier_id !== undefined) headerPatch.supplier_id = body.supplier_id

        const itemPatch: UpdateProductionItemRequest = {}
        if (body.material_name !== undefined) itemPatch.material_name = body.material_name
        if (body.price !== undefined) itemPatch.price = body.price
        if (body.si_unit !== undefined) itemPatch.si_unit = body.si_unit
        if (body.amount !== undefined) itemPatch.amount = body.amount

        if (Object.keys(headerPatch).length > 0 && body.header_id) {
          await financeHeaderApi.update(body.header_id, headerPatch)
        }
        if (Object.keys(itemPatch).length > 0) {
          await productionItemApi.update(id, itemPatch)
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: PRODUCTION_HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry updated')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  // Deletes the item; if that was the last item under its header, the
  // now-empty header is cleaned up too (best-effort — failure is harmless,
  // it just leaves an orphaned header with zero rows).
  useDelete: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (id: number) => {
        const grouped = qc.getQueryData<Record<string, ProductionItem[]>>(PRODUCTION_ITEMS_KEY)
        const orphanedHeaderId = grouped
          ? Object.entries(grouped).find(([, items]) => items.length === 1 && items[0].id === id)?.[0]
          : undefined

        await productionItemApi.delete(id)
        if (orphanedHeaderId) {
          await financeHeaderApi.delete(orphanedHeaderId).catch(() => {})
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: PRODUCTION_HEADERS_KEY })
        qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
        toast.success('Production entry deleted')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },
}

export const operationHooks = {
  useList: () => {
    const headers = useQuery({ queryKey: OPERATION_HEADERS_KEY, queryFn: () => financeHeaderApi.listByType('operation') })
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
        const existingHeaders = qc.getQueryData<FinanceHeader[]>(OPERATION_HEADERS_KEY) ?? []
        const headerExists = existingHeaders.some(h => h.id === row.header_id)
        if (!headerExists) {
          // See productionHooks.useCreate — row.date is trusted here, made
          // meaningful by the caller (Quick Add or the spreadsheet's "new
          // Kas Bon" modal) before this mutation ever runs.
          const newHeader = await financeHeaderApi.create({
            id: row.header_id, type: 'operation', date: row.date,
            supplier_id: 0, description: row.description,
          })
          qc.setQueryData<FinanceHeader[]>(OPERATION_HEADERS_KEY, (old = []) => [...old, newHeader])
        }
        return operationItemApi.create({ header_id: row.header_id, description: row.item_description, price: row.price })
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: OPERATION_HEADERS_KEY })
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
        if (body.price !== undefined) itemPatch.price = body.price

        if (Object.keys(headerPatch).length > 0 && body.header_id) {
          await financeHeaderApi.update(body.header_id, headerPatch)
        }
        if (Object.keys(itemPatch).length > 0) {
          await operationItemApi.update(id, itemPatch)
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: OPERATION_HEADERS_KEY })
        qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
        toast.success('Operation entry updated')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },

  useDelete: () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (id: number) => {
        const grouped = qc.getQueryData<Record<string, OperationItem[]>>(OPERATION_ITEMS_KEY)
        const orphanedHeaderId = grouped
          ? Object.entries(grouped).find(([, items]) => items.length === 1 && items[0].id === id)?.[0]
          : undefined

        await operationItemApi.delete(id)
        if (orphanedHeaderId) {
          await financeHeaderApi.delete(orphanedHeaderId).catch(() => {})
        }
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: OPERATION_HEADERS_KEY })
        qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
        toast.success('Operation entry deleted')
      },
      onError: (e: Error) => toast.error(e.message),
    })
  },
}