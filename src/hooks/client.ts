import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clientApi, clientContactApi, clientItemApi, clientItemPriceApi } from '@/api'
import type { ClientItemPrice } from '@/types'
import { makeCrudHooks } from './crud'

// Client catalogue items and their yearly prices: plain CRUD. Invalidating
// ['client-items'] also covers ['client-items', 'by-client', id].

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

// A client's price history with each item's name and size alongside.
export interface ClientItemPriceRow extends ClientItemPrice {
  item_name: string
  size: string | null
}
