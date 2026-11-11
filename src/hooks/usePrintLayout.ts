import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import i18n from '@/i18n/config'
import { printLayoutApi } from '@/api'
import { friendlyError } from '@/utils/friendlyError'
import { PRINT_DEFAULTS, resolvePrintLayout, samePrintLayout, type PrintDocType, type PrintLayout } from '@/utils/printLayout'

/** A document's layout as saved for everyone, plus the draft being tried in
 *  the Layout panel. The page always shows (and prints) the draft, so a
 *  change can be tried on paper before it's saved; leaving the page drops an
 *  unsaved draft. */
export function usePrintLayout(docType: PrintDocType) {
  const qc = useQueryClient()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['print-layouts'],
    queryFn: printLayoutApi.list,
    staleTime: 60_000,
  })
  const saved = resolvePrintLayout(docType, rows?.find(r => r.doc_type === docType)?.settings)
  const [draft, setDraft] = useState<PrintLayout | null>(null)
  const layout = draft ?? saved
  const defaults = PRINT_DEFAULTS[docType]

  const save = useMutation({
    // The built-in layout is saved as "no layout", so a later change to the
    // defaults reaches it too.
    mutationFn: async (next: PrintLayout) => {
      if (samePrintLayout(next, defaults)) await printLayoutApi.reset(docType)
      else await printLayoutApi.save(docType, next)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['print-layouts'] })
      setDraft(null)
      toast.success(i18n.t('printLayout.saved'))
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  })

  return {
    layout,
    saved,
    defaults,
    isLoading,
    dirty: draft != null && !samePrintLayout(draft, saved),
    isDefault: samePrintLayout(layout, defaults),
    isSaving: save.isPending,
    change: (patch: Partial<PrintLayout>) => setDraft(prev => ({ ...(prev ?? saved), ...patch })),
    resetToDefaults: () => setDraft({ ...defaults }),
    cancel: () => setDraft(null),
    save: () => save.mutate(layout),
  }
}

export type PrintLayoutState = ReturnType<typeof usePrintLayout>
