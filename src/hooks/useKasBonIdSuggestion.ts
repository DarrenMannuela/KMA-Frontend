import { useEffect, useState } from 'react'
import { suggestNextKasBonId } from '@/utils/KasBonId'

// Drives the "Kas Bon ID" field's auto-suggest behavior, shared between
// ProductionDashboard's and OperationsDashboard's Quick Add forms:
// - Fills in the suggested next Kas Bon ID whenever the field is empty and
//   the user hasn't typed their own — covers first opening Quick Add
//   before `headers` has loaded (refills once it does) and clicking "New
//   Kas Bon" (which clears header_id and re-triggers this).
// - Once the user types their own value, `idTouched` flips true and we
//   back off completely so we never clobber a manually-entered ID.
// - `reset()` powers the manual "reset to suggested" button, and is also
//   what a caller should call from a 409-on-create handler — same race
//   OrdersPage/GenerateInvoiceForm guard against: the suggested ID is a
//   client-side guess off `headers`, which can be stale right after a
//   conflict (the header that just collided may not have landed in this
//   component's own query cache yet). `refetchHeaders`, if passed, is
//   awaited before recomputing so the retry doesn't just hand back the
//   same taken number; omit it and reset() falls back to the plain local
//   `headers` array, same as before this existed.
export function useKasBonIdSuggestion(
  headers: { id: string }[],
  headerId: string,
  setHeaderId: (value: string) => void,
  refetchHeaders?: () => Promise<{ data?: { id: string }[] }>
) {
  const [idTouched, setIdTouched] = useState(false)

  useEffect(() => {
    if (!idTouched && !headerId) {
      setHeaderId(suggestNextKasBonId(headers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, headerId, idTouched])

  const reset = async () => {
    setIdTouched(false)
    if (refetchHeaders) {
      const { data: freshHeaders } = await refetchHeaders()
      setHeaderId(suggestNextKasBonId(freshHeaders ?? headers))
      return
    }
    setHeaderId(suggestNextKasBonId(headers))
  }

  return { idTouched, setIdTouched, reset }
}