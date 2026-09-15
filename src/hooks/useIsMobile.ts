import { useEffect, useState } from 'react'

// Matches Tailwind's own `md` breakpoint (768px) so "mobile" here means the
// same thing it does everywhere else in this codebase's CSS (e.g. the
// AppShell/Sidebar layout, which is a fixed-width desktop shell below this
// same width today — this hook is what a page reaches for to offer a real
// alternative there, like MobileEntryList in place of SpreadsheetView,
// rather than just letting the desktop layout squeeze).
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
