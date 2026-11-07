import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

/** A horizontal scroller that fades whichever edge has more content past it,
 *  so a table or chart cut off at the screen edge reads as "scroll for more"
 *  instead of as broken layout. */
export const ScrollX = forwardRef<HTMLDivElement, { className?: string; style?: React.CSSProperties; children: React.ReactNode; mask?: boolean }>(
  function ScrollX({ className = '', style, children, mask = true }, forwarded) {
    const ref = useRef<HTMLDivElement>(null)
    useImperativeHandle(forwarded, () => ref.current as HTMLDivElement)

    useEffect(() => {
      const el = ref.current
      if (!el) return
      const update = () => {
        const max = el.scrollWidth - el.clientWidth
        el.toggleAttribute('data-fade-left', el.scrollLeft > 1)
        el.toggleAttribute('data-fade-right', el.scrollLeft < max - 1)
      }
      update()
      el.addEventListener('scroll', update, { passive: true })
      const ro = new ResizeObserver(update)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
      return () => { el.removeEventListener('scroll', update); ro.disconnect() }
    }, [])

    return (
      // mask=false keeps only the data-fade-* attributes, for content that
      // shows the cue itself (CrudPage's pinned Actions column draws a shadow).
      <div ref={ref} className={`${mask ? 'scroll-fade ' : ''}overflow-x-auto overscroll-x-contain ${className}`} style={style}>
        {children}
      </div>
    )
  },
)
