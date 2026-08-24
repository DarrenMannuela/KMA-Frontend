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
// - `reset()` powers the manual "reset to suggested" button.
export function useKasBonIdSuggestion(
  headers: { id: string }[],
  headerId: string,
  setHeaderId: (value: string) => void
) {
  const [idTouched, setIdTouched] = useState(false)

  useEffect(() => {
    if (!idTouched && !headerId) {
      setHeaderId(suggestNextKasBonId(headers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, headerId, idTouched])

  const reset = () => {
    setIdTouched(false)
    setHeaderId(suggestNextKasBonId(headers))
  }

  return { idTouched, setIdTouched, reset }
}