import { createElement, useMemo } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { catalogueApi } from '@/api'
import type { CatalogueBatch, CatalogueBatchResult, Client, Item, Order } from '@/types'
import { itemKey } from '@/pages/client/catalogue/catalogueModel'
import { orderHooks, itemHooks } from './order'

// Every catalogue change (a price edit, a price rise, items added, copied or
// imported) goes through POST /client-catalogue/batch, and leaves the batch
// that reverses it on this stack.

interface UndoEntry { label: string; batch: CatalogueBatch }
const undoStack: UndoEntry[] = []
const UNDO_DEPTH = 30

/** The batch that puts back what a saved batch changed. */
export function inverseCatalogue(clientId: number, r: CatalogueBatchResult): CatalogueBatch {
  const created = new Set((r.items_created ?? []).map(i => i.id))
  const deleted = new Map((r.items_deleted ?? []).map(i => [i.id, i]))
  const before = (r.prices_before ?? []).filter(p => !created.has(p.client_item_id) && !deleted.has(p.client_item_id))
  return {
    client_id: clientId,
    // A removed item comes back with its prices (as a new item).
    upsert_items: [...deleted.values()].map(i => ({
      item_name: i.item_name, size: i.size ?? '', notes: i.notes,
      prices: (r.prices_before ?? []).filter(p => p.client_item_id === i.id)
        .map(p => ({ year: p.year, price: p.price, effective_date: p.effective_date })),
    })),
    set_prices: before.filter(p => p.existed)
      .map(p => ({ client_item_id: p.client_item_id, year: p.year, price: p.price, effective_date: p.effective_date })),
    delete_prices: before.filter(p => !p.existed).map(p => ({ client_item_id: p.client_item_id, year: p.year })),
    delete_items: [...created],
  }
}

const isEmpty = (b: CatalogueBatch) =>
  !b.upsert_items?.length && !b.set_prices?.length && !b.delete_prices?.length && !b.delete_items?.length

function invalidateCatalogue(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['client-items'] })
  qc.invalidateQueries({ queryKey: ['client-item-prices'] })
}

/** Reverses the last catalogue change. */
export async function undoCatalogue(qc: QueryClient) {
  const entry = undoStack.pop()
  if (!entry) {
    toast('Nothing to undo')
    return
  }
  try {
    await catalogueApi.apply(entry.batch)
    toast.success(`Undone: ${entry.label}`)
  } catch (e) {
    toast.error(`Couldn't undo: ${(e as Error).message}`)
  } finally {
    invalidateCatalogue(qc)
  }
}

/** Refreshes the catalogue after saved batches and remembers how to undo
 *  them, as one step. */
export function recordCatalogue(qc: QueryClient, clientId: number, label: string, results: CatalogueBatchResult[]) {
  invalidateCatalogue(qc)
  const inverse: CatalogueBatch = { client_id: clientId, upsert_items: [], set_prices: [], delete_prices: [], delete_items: [] }
  for (const part of results.map(r => inverseCatalogue(clientId, r)).reverse()) {
    inverse.upsert_items!.push(...part.upsert_items!)
    inverse.set_prices!.push(...part.set_prices!)
    inverse.delete_prices!.push(...part.delete_prices!)
    inverse.delete_items!.push(...part.delete_items!)
  }
  if (isEmpty(inverse)) {
    toast.success(label)
    return
  }
  undoStack.push({ label, batch: inverse })
  if (undoStack.length > UNDO_DEPTH) undoStack.shift()
  toast.success(t => createElement('span', { className: 'flex items-center gap-3' },
    label,
    createElement('button', {
      className: 'text-navy-600 font-semibold hover:underline',
      onClick: () => { toast.dismiss(t.id); undoCatalogue(qc) },
    }, 'Undo'),
  ), { duration: 6000 })
}

export interface CatalogueRequest {
  batch: CatalogueBatch
  /** For the toast and the undo message: "Raised 12 prices for 2027". */
  label: string
}

/** Saves catalogue changes, with Undo in the toast and on Ctrl+Z. */
export function useCatalogueBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batch }: CatalogueRequest) => catalogueApi.apply(batch),
    onSuccess: (res, { batch, label }) => recordCatalogue(qc, batch.client_id, label, [res]),
    onError: (e: Error) => toast.error(e.message),
  })
}

// ── Sales ────────────────────────────────────────────────────────────────────

/** One order line of a catalogue item. */
export interface Sale {
  item: string
  size: string
  orderId: string
  date: string
  qty: number
  price: number
}

/** True when an order is this client's (linked, or an older order with only
 *  the company name typed). */
export function isClientOrder(o: Order, client: Pick<Client, 'id' | 'client_name'>) {
  if (o.client_id != null) return o.client_id === client.id
  return (o.company ?? '').trim().toUpperCase() === client.client_name.trim().toUpperCase()
}

function salesFrom(orders: Order[], items: Item[], client: Pick<Client, 'id' | 'client_name'>) {
  const theirs = new Map(orders.filter(o => isClientOrder(o, client)).map(o => [o.id, o]))
  const sales = new Map<string, Sale[]>()
  for (const it of items) {
    const o = theirs.get(it.order_id)
    if (!o) continue
    const k = itemKey(it.item_name, it.size)
    const list = sales.get(k) ?? []
    list.push({ item: it.item_name.trim().toUpperCase(), size: (it.size ?? '').trim().toUpperCase(), orderId: o.id, date: o.date, qty: it.amount, price: it.price })
    sales.set(k, list)
  }
  for (const list of sales.values()) list.sort((a, b) => b.date.localeCompare(a.date))
  return sales
}

/** What this client has ordered of each item, newest first, keyed by itemKey. */
export function useClientSales(client: Pick<Client, 'id' | 'client_name'> | undefined) {
  const orders = orderHooks.useList()
  const items = itemHooks.useList()
  const sales = useMemo(
    () => (client && orders.data && items.data ? salesFrom(orders.data, items.data, client) : new Map<string, Sale[]>()),
    [client, orders.data, items.data],
  )
  return { sales, isLoading: orders.isLoading || items.isLoading }
}
