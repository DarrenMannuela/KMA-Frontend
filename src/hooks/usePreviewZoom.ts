import { useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

/** Phones: a print page's preview fits the screen width, so its text is
 *  small; this switches between that and the page at its real size (scroll
 *  to move around it). Pass `fit` to useScaleToFit; ZoomButton toggles. */
export function usePreviewZoom() {
  const isMobile = useIsMobile()
  const [actual, setActual] = useState(false)
  return { fit: !(isMobile && actual), actual: isMobile && actual, toggle: () => setActual(a => !a), isMobile }
}

export type PreviewZoom = ReturnType<typeof usePreviewZoom>
