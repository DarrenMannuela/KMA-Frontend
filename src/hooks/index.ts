import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ordersApi, itemsApi, invoicesApi, suppliersApi,
  productionApi, operationsApi, deliveryApi, deliveryItemApi,
} from '@/api'

// ── hook factory ─────────────────────────────────────────────────────────────
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
export const productionHooks   = makeCrudHooks('production',     productionApi,    'Production entry')
export const operationHooks    = makeCrudHooks('operations',     operationsApi,    'Operation')
export const deliveryHooks     = makeCrudHooks('delivery',       deliveryApi,      'Delivery')
export const deliveryItemHooks = makeCrudHooks('delivery-orders', deliveryItemApi, 'Delivery item')
