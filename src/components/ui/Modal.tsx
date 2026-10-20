import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

// A bottom sheet on phones, a centered dialog on desktop.
export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const isMobile = useIsMobile()
  const contentRef = useRef<HTMLDivElement>(null)
  // Any real edit inside the modal (typing, picking a date/select, checking a
  // box) marks it touched. Tracked at the DOM level, not per-field React
  // state, so every modal in the app gets this for free with no changes to
  // what it renders inside — a click alone (e.g. an "Add" button) doesn't
  // count, only input/change.
  const touchedRef = useRef(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onTouch = () => { touchedRef.current = true }
    el.addEventListener('input', onTouch)
    el.addEventListener('change', onTouch)
    return () => {
      el.removeEventListener('input', onTouch)
      el.removeEventListener('change', onTouch)
    }
  }, [])

  // The backdrop, Escape and the X are how a modal gets closed by accident;
  // asking first there is most of the value. A form's own Cancel/Done button
  // is a deliberate choice and is each form's to guard if it wants to (see
  // useUnsavedChanges) — Modal has no way to intercept a call to the onClose
  // prop it was simply handed down to one of those.
  const guardedClose = () => {
    if (touchedRef.current && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && guardedClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in"
        onClick={e => e.target === e.currentTarget && guardedClose()}
      >
        <div className="bg-white w-full rounded-t-3xl shadow-2xl slide-up flex flex-col max-h-[88vh] dark:bg-navy-900">
          {/* The grab handle is only a visual cue; the backdrop and X close it. */}
          <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
            <div className="w-9 h-1 rounded-full bg-slate-200 dark:bg-navy-700" />
          </div>
          <div className="flex items-center justify-between px-5 pb-3 shrink-0">
            <h3 className="font-display font-semibold text-navy-900 text-base dark:text-slate-50">{title}</h3>
            <button className="btn-ghost !px-2 !py-1.5" onClick={guardedClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div ref={contentRef} className="overflow-y-auto flex-1 px-5 pb-6">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/50 backdrop-blur-sm fade-in"
      onClick={e => e.target === e.currentTarget && guardedClose()}
    >
      <div className={`bg-white w-full ${sizes[size]} rounded-2xl shadow-2xl fade-up flex flex-col max-h-[90vh] dark:bg-navy-900`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 dark:border-navy-800">
          <h3 className="font-display font-semibold text-navy-900 text-base dark:text-slate-50">{title}</h3>
          <button className="btn-ghost !px-2 !py-1.5" onClick={guardedClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div ref={contentRef} className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
