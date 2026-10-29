import { useEffect, useState } from 'react'

// The real, currently-visible viewport height in CSS pixels. Unlike any
// `vh`/`dvh` unit, `window.visualViewport` is the one signal every major
// mobile browser actually updates when the on-screen keyboard opens or
// closes — a `vh`-based max-height on a modal sheet stays sized to the
// pre-keyboard viewport, so the keyboard just overlays on top of whatever
// was at the bottom (here, the part of a dialog a focused input had
// nothing to do with). Falls back to `window.innerHeight` where the API
// doesn't exist (very old browsers) — effectively "assume no keyboard,"
// the previous behavior.
export function useVisualViewportHeight(): number {
  const [height, setHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
  return height
}
