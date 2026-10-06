import { createElement, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { financeHeaderApi, productionItemApi, operationItemApi, financeBatchApi, budgetApi, recurringCostApi } from '@/api'
import type {
  FinanceHeader, ProductionItem, OperationItem, ProductionRow, OperationRow,
  CreateProductionRowRequest, CreateOperationRowRequest,
  FinanceBatch, FinanceBatchResult, Budget, RecurringCost,
} from '@/types'

// A Kas Bon (FinanceHeader) holds production lines, operation lines, or both.
// The pages show one row per line with its Kas Bon's date and description
// merged in; every change goes through POST /finance/batch, which saves it
// in one transaction and returns what's needed to undo it.

const HEADERS_KEY = ['finance-header']
const PRODUCTION_ITEMS_KEY = ['production-item', 'grouped']
const OPERATION_ITEMS_KEY = ['operation-item', 'grouped']
const BUDGET_KEY = ['budget']
const RECURRING_KEY = ['recurring-cost']

export function useFinanceHeaders() {
  return useQuery({ queryKey: HEADERS_KEY, queryFn: financeHeaderApi.list })
}

function toProductionRows(headers: FinanceHeader[], grouped: Record<string, ProductionItem[]>): ProductionRow[] {
  return headers.flatMap(h => (grouped[h.id] ?? []).map(item => ({
    id: item.id, header_id: h.id, date: h.date, description: h.description,
    supplier_id: item.supplier_id, supplier: item.supplier,
    material_name: item.material_name, price: item.price, si_unit: item.si_unit, amount: item.amount,
    order_id: item.order_id ?? null,
  })))
}

function toOperationRows(headers: FinanceHeader[], grouped: Record<string, OperationItem[]>): OperationRow[] {
  return headers.flatMap(h => (grouped[h.id] ?? []).map(item => ({
    id: item.id, header_id: h.id, date: h.date, description: h.description,
    category: item.category, item_description: item.description, price: item.price,
    order_id: item.order_id ?? null,
  })))
}

/** A production line's total in rupiah (quantities can be fractional). */
export const lineTotal = (row: { price: number; amount: number }) => Math.round(row.price * row.amount)

function useRows<R, I>(itemsKey: string[], fetchItems: () => Promise<Record<string, I[]>>, toRows: (h: FinanceHeader[], g: Record<string, I[]>) => R[]) {
  const headers = useQuery({ queryKey: HEADERS_KEY, queryFn: financeHeaderApi.list })
  const items = useQuery({ queryKey: itemsKey, queryFn: fetchItems })
  const data = useMemo(
    () => (headers.data && items.data) ? toRows(headers.data, items.data) : [],
    [headers.data, items.data, toRows],
  )
  return {
    data,
    isLoading: headers.isLoading || items.isLoading,
    isError: headers.isError || items.isError,
    refetch: () => Promise.all([headers.refetch(), items.refetch()]),
  }
}

// ── Undo ─────────────────────────────────────────────────────────────────────
// Each saved batch leaves the batch that reverses it on this stack.

interface UndoEntry { label: string; batch: FinanceBatch }
const undoStack: UndoEntry[] = []
const UNDO_DEPTH = 30

const productionFields = (i: ProductionItem) => ({
  header_id: i.header_id, material_name: i.material_name, price: i.price, si_unit: i.si_unit,
  amount: i.amount, supplier_id: i.supplier_id, order_id: i.order_id ?? null,
})
const operationFields = (i: OperationItem) => ({
  header_id: i.header_id, category: i.category, description: i.description, price: i.price, order_id: i.order_id ?? null,
})

/** The batch that puts everything a saved batch changed back as it was. */
export function inverseBatch(r: FinanceBatchResult): FinanceBatch {
  return {
    headers: r.headers_deleted ?? [],
    header_update: r.headers_before ?? [],
    production_create: r.production_deleted ?? [],
    operation_create: r.operation_deleted ?? [],
    production_update: (r.production_before ?? []).map(i => ({ id: i.id, fields: productionFields(i) })),
    operation_update: (r.operation_before ?? []).map(i => ({ id: i.id, fields: operationFields(i) })),
    production_delete: (r.production ?? []).map(i => i.id),
    operation_delete: (r.operation ?? []).map(i => i.id),
  }
}

const isEmptyBatch = (b: FinanceBatch) => Object.values(b).every(v => !v || (Array.isArray(v) && v.length === 0))

function invalidateFinance(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: HEADERS_KEY })
  qc.invalidateQueries({ queryKey: PRODUCTION_ITEMS_KEY })
  qc.invalidateQueries({ queryKey: OPERATION_ITEMS_KEY })
}

/** Reverses the last saved change. */
export async function undoLast(qc: QueryClient) {
  const entry = undoStack.pop()
  if (!entry) {
    toast('Nothing to undo')
    return
  }
  try {
    await financeBatchApi.apply(entry.batch)
    toast.success(`Undone: ${entry.label}`)
  } catch (e) {
    toast.error(`Couldn't undo: ${(e as Error).message}`)
  } finally {
    invalidateFinance(qc)
  }
}

function undoToast(label: string, qc: QueryClient) {
  toast.success(t => createElement('span', { className: 'flex items-center gap-3' },
    label,
    createElement('button', {
      className: 'text-navy-600 font-semibold hover:underline',
      onClick: () => { toast.dismiss(t.id); undoLast(qc) },
    }, 'Undo'),
  ), { duration: 6000 })
}

export interface BatchRequest {
  batch: FinanceBatch
  /** What the change was, for the toast and the undo message: "Deleted 3 lines". */
  label: string
}

/** Refreshes the lists after saved batches and remembers how to undo them,
 *  as one step. */
export function recordBatches(qc: QueryClient, label: string, results: FinanceBatchResult[]) {
  invalidateFinance(qc)
  const parts = results.map(inverseBatch).reverse()
  const inverse: FinanceBatch = {}
  for (const p of parts) {
    for (const [k, v] of Object.entries(p) as [keyof FinanceBatch, unknown[]][]) {
      (inverse[k] as unknown[]) = [...((inverse[k] as unknown[]) ?? []), ...v]
    }
  }
  if (isEmptyBatch(inverse)) {
    toast.success(label)
    return
  }
  undoStack.push({ label, batch: inverse })
  if (undoStack.length > UNDO_DEPTH) undoStack.shift()
  undoToast(label, qc)
}

/** Saves a batch of Kas Bon changes, with Undo in its toast and on Ctrl+Z. */
export function useFinanceBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batch }: BatchRequest) => financeBatchApi.apply(batch),
    onSuccess: (res, { label }) => recordBatches(qc, label, [res]),
    onError: (e: Error) => toast.error(e.message),
  })
}

// ── Lists, and the quick-add used by the Production/Operations dashboards ────

type MutateOpts = { onSuccess?: () => void; onError?: (e: Error) => void }

function headerFor(row: { header_id: string; date: string; description: string }): FinanceHeader {
  return { id: row.header_id, date: row.date, description: row.description }
}

export const productionHooks = {
  useList: () => useRows(PRODUCTION_ITEMS_KEY, productionItemApi.grouped, toProductionRows),

  /** Adds one line, creating its Kas Bon first if it's new. */
  useCreate: () => {
    const batch = useFinanceBatch()
    return {
      ...batch,
      mutate: (row: CreateProductionRowRequest, opts?: MutateOpts) => batch.mutate({
        label: `Added ${row.material_name || 'a line'} to ${row.header_id}`,
        batch: {
          headers: [headerFor(row)],
          production_create: [{
            header_id: row.header_id, supplier_id: row.supplier_id, material_name: row.material_name,
            price: row.price, si_unit: row.si_unit, amount: row.amount, order_id: row.order_id ?? null,
          }],
        },
      }, opts),
    }
  },
}

export const operationHooks = {
  useList: () => useRows(OPERATION_ITEMS_KEY, operationItemApi.grouped, toOperationRows),

  useCreate: () => {
    const batch = useFinanceBatch()
    return {
      ...batch,
      mutate: (row: CreateOperationRowRequest, opts?: MutateOpts) => batch.mutate({
        label: `Added ${row.item_description || row.category} to ${row.header_id}`,
        batch: {
          headers: [headerFor(row)],
          operation_create: [{
            header_id: row.header_id, category: row.category, description: row.item_description,
            price: row.price, order_id: row.order_id ?? null,
          }],
        },
      }, opts),
    }
  },
}

// ── Budgets and recurring costs ──────────────────────────────────────────────

export function useBudgets() {
  return useQuery({ queryKey: BUDGET_KEY, queryFn: budgetApi.list })
}

export function useSetBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Omit<Budget, 'id'>) => budgetApi.put(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUDGET_KEY }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRecurringCosts() {
  return useQuery({ queryKey: RECURRING_KEY, queryFn: recurringCostApi.list })
}

export function useSaveRecurringCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rc: Omit<RecurringCost, 'id'> & { id?: number }) =>
      rc.id ? recurringCostApi.update(rc.id, rc) : recurringCostApi.create(rc),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteRecurringCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => recurringCostApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECURRING_KEY }),
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Adds this month's recurring costs as one Kas Bon. */
export function usePostRecurringMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: recurringCostApi.postMonth,
    onSuccess: res => {
      invalidateFinance(qc)
      qc.invalidateQueries({ queryKey: RECURRING_KEY })
      const n = res.posted?.length ?? 0
      toast.success(n ? `Added ${n} recurring cost${n === 1 ? '' : 's'}` : 'Already added for this month')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
