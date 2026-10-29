import { useEffect } from 'react'

// Print pages render a fixed white A4 sheet regardless of the app's dark
// mode — same as a printed page staying white no matter the room's light.
// But globals.css sets `.dark body { background: #0a0f1e }` for the rest of
// the app, and on a phone, pinch-zooming out (or iOS's elastic overscroll)
// can reveal a sliver of that raw body background beyond this page's own
// content before React has anything painted there — a dark navy "gutter" a
// print page should never show. Force the body back to white for as long
// as a print page is mounted.
export function usePrintLightBody() {
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#fff'
    return () => { document.body.style.background = prev }
  }, [])
}
