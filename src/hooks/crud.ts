import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// ── generic CRUD hook factory (unchanged — used by orders/items/etc.) ────────
export function makeCrudHooks<T, C, U>(
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
