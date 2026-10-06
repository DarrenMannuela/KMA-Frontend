import { useEffect, useState } from 'react'

// Below Tailwind's md breakpoint (768px).
const QUERY = '(max-width: 767px)'

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
