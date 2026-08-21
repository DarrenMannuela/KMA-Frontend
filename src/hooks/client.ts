import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clientApi, clientContactApi, clientItemApi, clientItemPriceApi } from '@/api'
import type { ClientItem, ClientItemPrice } from '@/types'
import { makeCrudHooks } from './crud'

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
