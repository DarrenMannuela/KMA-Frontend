import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { financeHeaderApi, productionItemApi, operationItemApi } from '@/api'
import type {
  FinanceHeader, ProductionItem, OperationItem, ProductionRow, OperationRow,
  CreateProductionRowRequest, UpdateProductionRowRequest,
  CreateOperationRowRequest, UpdateOperationRowRequest,
  UpdateFinanceHeaderRequest, UpdateProductionItemRequest, UpdateOperationItemRequest,
} from '@/types'

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
    // Unlike makeCrudHooks' plain useList, this composes two separate
    // queries — a failure in either one previously vanished into the same
    // `data: []` the ternary above produces for "still loading", so a
    // failed fetch and a genuinely empty Production page looked identical
    // to any caller (e.g. CrudPage's isError/onRetry support added
    // elsewhere has nothing to plug into without this). refetch() re-runs
    // both underlying queries so a caller's Retry button actually retries
    // everything this page depends on, not just one half of it.
    return {
      data,
      isLoading: headers.isLoading || items.isLoading,
      isError: headers.isError || items.isError,
      refetch: () => Promise.all([headers.refetch(), items.refetch()]),
    }
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
    // See productionHooks.useList's comment — same composed-query error
    // gap, same fix.
    return {
      data,
      isLoading: headers.isLoading || items.isLoading,
      isError: headers.isError || items.isError,
      refetch: () => Promise.all([headers.refetch(), items.refetch()]),
    }
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