import { useEffect, useState } from 'react'

// Exactly the screens that don't get the docked sidebar (see `dock` in
// tailwind.config.js): narrow, or short like a phone held sideways. Keeping
// this the same as `dock` means a landscape phone gets one consistent phone
// layout instead of a drawer next to desktop tables and centred dialogs.
export const PHONE_QUERY = '(max-width: 767px), (max-height: 499px)'
const QUERY = PHONE_QUERY

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    // addEventListener('change', …), not the older addListener — every
    // browser this app targets (see the rest of the codebase's baseline)
    // supports the modern API.
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
