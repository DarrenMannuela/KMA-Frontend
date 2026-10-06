import { useEffect, useState } from 'react'
import { suggestNextKasBonId } from '@/utils/KasBonId'

// Fills the Kas Bon ID field with the next free number until the user types
// their own. reset() goes back to the suggestion; pass refetchHeaders so a
// reset after a 409 uses a fresh list.
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