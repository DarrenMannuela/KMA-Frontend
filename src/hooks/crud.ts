import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { friendlyError } from '@/utils/friendlyError'
import { undoToast, undoMessages } from '@/utils/undoToast'
import { trashApi } from '@/api'
import i18n from '@/i18n/config'

// The entity labels callers pass in (still plain English words), mapped to
// their translation keys; an unlisted label is shown as passed.
const LABEL_KEYS: Record<string, string> = {
  'Delivery': 'delivery',
  'Delivery item': 'deliveryItem',
  'Invoice': 'invoice',
  'Client': 'client',
  'Contact': 'contact',
  'Item': 'item',
  'Price': 'price',
  'Order': 'order',
  'Supplier': 'supplier',
  'Material': 'material',
  'Colour': 'colour',
}

const crudToast = (action: 'created' | 'updated' | 'deleted', label: string) => {
  const key = LABEL_KEYS[label]
  const shown = key ? i18n.t(`crudToasts.labels.${key}`) : label
  return i18n.t(`crudToasts.${action}`, { label: shown })
}

// ── Undo for deletes ─────────────────────────────────────────────────────────
// The backend keeps what an order/invoice/delivery/client/supplier delete
// removed and answers with a restore id; this is the stack of those, newest
// last, for the toast's Undo and Ctrl+Z on their list pages.
interface DeleteUndo { restoreId: string; label: string }
const deleteUndos: DeleteUndo[] = []
const DELETE_UNDO_DEPTH = 20

async function restoreDeleted(qc: QueryClient, entry: DeleteUndo) {
  const i = deleteUndos.indexOf(entry)
  if (i >= 0) deleteUndos.splice(i, 1)
  try {
    await trashApi.restore(entry.restoreId)
    undoMessages.done(entry.label)
  } catch (e) {
    toast.error(i18n.t('common.undoDeleteFailed', { message: friendlyError(e as Error) }))
  } finally {
    // A restored order or client brings back rows of several kinds at once
    // (items, invoices, contacts, Kas Bon links), so refresh everything.
    qc.invalidateQueries()
  }
}

/** Puts back the most recent undoable delete (Ctrl+Z on a list page). */
export function undoLastDelete(qc: QueryClient) {
  const entry = deleteUndos[deleteUndos.length - 1]
  if (!entry) { undoMessages.nothing(); return }
  restoreDeleted(qc, entry)
}

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
        // Awaited so isPending (and anything disabled by it) stays true
        // until the list actually reflects the new record, not just until
        // the create request itself settles — otherwise a derived value
        // like "remaining quantity" can still read the pre-create state
        // when a second submit becomes possible again.
        onSuccess: async () => { await qc.invalidateQueries({ queryKey: [key] }); toast.success(crudToast('created', label)) },
        onError:   (e: Error) => toast.error(friendlyError(e)),
      })
    },

    useUpdate: () => {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: ({ id, body }: { id: string | number; body: U }) => api.update(id, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: [key] }); toast.success(crudToast('updated', label)) },
        onError:   (e: Error) => toast.error(friendlyError(e)),
      })
    },

    useDelete: () => {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: (id: string | number) => api.delete(id),
        onSuccess: (res: unknown) => {
          qc.invalidateQueries({ queryKey: [key] })
          const message = crudToast('deleted', label)
          const restoreId = (res as { restoreId?: string | null } | undefined)?.restoreId
          if (!restoreId) { toast.success(message); return }
          const entry = { restoreId, label: message }
          deleteUndos.push(entry)
          if (deleteUndos.length > DELETE_UNDO_DEPTH) deleteUndos.shift()
          undoToast(message, () => restoreDeleted(qc, entry))
        },
        onError:   (e: Error) => toast.error(friendlyError(e)),
      })
    },
  }
}
