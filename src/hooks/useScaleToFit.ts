import { useCallback, useLayoutEffect, useState } from 'react'

// Scales a print document (A4, ~794px) down to fit a phone screen. Screen
// only: each print page's @media print resets the transform. With `active`
// false (desktop) the scale is 1.
export function useScaleToFit(active: boolean) {
  // State-backed callback refs: the nodes only mount after the page's data
  // loads, and a plain ref change wouldn't rerun the effect.
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
    // Layout sizes ignore transforms, so measuring the scaled node is safe.
    const recompute = () => {
      // The space inside the container's padding.
      const containerStyle = window.getComputedStyle(container)
      const horizontalPadding = parseFloat(containerStyle.paddingLeft || '0') + parseFloat(containerStyle.paddingRight || '0')
      const available = container.clientWidth - horizontalPadding
      const natural = { width: doc.offsetWidth, height: doc.offsetHeight }
      setNaturalSize(natural)
      setScale(natural.width > 0 && available > 0 ? Math.min(1, available / natural.width) : 1)
    }
    recompute()
    // Rescale when the document's size changes (rotation, page breaks).
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
