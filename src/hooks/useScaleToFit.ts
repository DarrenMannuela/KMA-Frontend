import { useCallback, useLayoutEffect, useState } from 'react'

// Shrinks a fixed-physical-page-width print document (A4 etc, ~794px)
// down to fit a narrower container — used on mobile print-preview pages,
// where the document is deliberately left at its real physical width (see
// each print page's "overflow-x-auto is load-bearing" comment) rather than
// reflowing it, but a bare horizontal-scroll-to-read-it experience turned
// out to read as "messy/cluttered" on a phone. This is purely a visual
// `transform: scale()` applied on screen — every print page's own
// stylesheet forces it back to `none` inside `@media print` (see each
// file's print <style> block), so the actual printed/exported output is
// completely unaffected and keeps using the browser's native paginated
// layout at full physical size.
//
// `active` should be false outside of mobile (desktop already fits the
// real width in its own scroll container) — scale is forced to 1 and the
// measured dimensions are ignored whenever it is.
export function useScaleToFit(active: boolean) {
  // Callback refs (state-backed), not plain useRef — every one of these
  // print pages gates its real document behind a loading/error check
  // (`if (isLoading) return <Spinner/>` etc.), so the DOM nodes this hook
  // needs don't exist on the FIRST commit and only get attached once data
  // arrives and the real tree mounts, several commits later. A plain
  // useRef's `.current` going from null to a node is invisible to
  // useLayoutEffect's dependency comparison (ref identity never changes),
  // so with `[active]` as the only dependency the effect ran exactly once
  // — while both refs were still null — and never got another chance to
  // run once the document actually existed, permanently stuck at scale 1.
  // Routing attachment through setState instead makes it a real
  // dependency the effect re-runs on.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [doc, setDoc] = useState<HTMLDivElement | null>(null)
  const containerRef = useCallback((node: HTMLDivElement | null) => setContainer(node), [])
  const docRef = useCallback((node: HTMLDivElement | null) => setDoc(node), [])

  const [scale, setScale] = useState(1)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    if (!active || !container || !doc) {
      setScale(1)
      return
    }
    // offsetWidth/offsetHeight reflect the element's own layout box, which
    // `transform` never changes (transform is purely a paint-time effect)
    // — so re-measuring the same node this hook is scaling is safe and
    // doesn't compound across recomputes.
    const recompute = () => {
      // clientWidth INCLUDES the container's own padding (every one of
      // these print pages wraps its document in a padded `p-8` div), but
      // a child renders INSIDE that padding — so sizing the scaled box to
      // the full clientWidth left it sitting exactly one padding-width
      // (32px) too wide, poking out past the padding's right edge. That
      // never showed up as page-level overflow (the overflow-x-auto
      // container happily absorbed it into its own internal scrollbar
      // instead of pushing the actual page wider) — it just meant the
      // "fully shrunk" preview still needed a short sideways scroll to
      // read the last sliver of every line, which is exactly the
      // "doesn't fit"/"too big" reports this was built to fix in the
      // first place. Subtracting the real padding is what makes
      // `available` match the space a child can actually occupy without
      // spilling past it.
      const containerStyle = window.getComputedStyle(container)
      const horizontalPadding = parseFloat(containerStyle.paddingLeft || '0') + parseFloat(containerStyle.paddingRight || '0')
      const available = container.clientWidth - horizontalPadding
      const natural = { width: doc.offsetWidth, height: doc.offsetHeight }
      setNaturalSize(natural)
      setScale(natural.width > 0 && available > 0 ? Math.min(1, available / natural.width) : 1)
    }
    recompute()
    // Width only changes on rotation/resize (the document's own width is a
    // fixed physical measurement); height changes whenever the document's
    // content does — e.g. page-break recalculation elsewhere in these
    // pages adding/removing a page after mount — so a ResizeObserver on
    // the document itself catches both without needing to enumerate every
    // dependency that can affect it.
    const ro = new ResizeObserver(recompute)
    ro.observe(doc)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [active, container, doc])

  return {
    containerRef,
    docRef,
    scale,
    scaledWidth: naturalSize.width * scale,
    scaledHeight: naturalSize.height * scale,
  }
}
