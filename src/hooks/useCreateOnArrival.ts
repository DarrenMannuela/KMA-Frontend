import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Router state a link passes to land straight in a page's "add" form
 *  (the dashboard's "New order", "Add production"…) rather than its list. */
export const CREATE_STATE = { create: true } as const

/** Calls `open` once when the page was reached with CREATE_STATE, then drops
 *  that state so Back or a refresh doesn't reopen the form. */
export function useCreateOnArrival(open: () => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const wanted = (location.state as { create?: boolean } | null)?.create === true
  useEffect(() => {
    if (!wanted) return
    navigate(location.pathname + location.search, { replace: true, state: null })
    open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])
}
