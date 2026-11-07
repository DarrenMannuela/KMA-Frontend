import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight'
import { useDialog } from '@/hooks/useDialog'
import { ConfirmDialog } from './index'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Ask before an accidental close (backdrop, Escape, X) once something has
   *  been typed. Turn off where the content saves every edit itself (the
   *  supplier catalogue) or the form already guards its own close
   *  (useUnsavedChanges), so nobody is asked twice, or about nothing. */
  guard?: boolean
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

// A bottom sheet on phones, a centered dialog on desktop.
export function Modal({ title, onClose, children, size = 'md', guard = true }: ModalProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const viewportHeight = useVisualViewportHeight()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [askDiscard, setAskDiscard] = useState(false)
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
  // useUnsavedChanges).
  const guardedClose = () => {
    if (guard && touchedRef.current) setAskDiscard(true)
    else onClose()
  }

  useDialog(panelRef, guardedClose)

  const header = (
    <>
      <h3 id={titleId} className="font-display font-semibold text-navy-900 text-base dark:text-slate-50">{title}</h3>
      <button
        type="button"
        className={`btn-ghost ${isMobile ? '!w-10 !h-10 !p-0 -mr-2' : '!px-2 !py-1.5'}`}
        onClick={guardedClose}
        aria-label={t('common.close')}
      >
        <X className="w-4 h-4" />
      </button>
    </>
  )

  const discard = askDiscard && (
    <ConfirmDialog
      message={t('common.discardChanges')}
      confirmLabel={t('common.discard')}
      onConfirm={() => { setAskDiscard(false); onClose() }}
      onCancel={() => setAskDiscard(false)}
    />
  )

  const panelProps = {
    ref: panelRef,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    tabIndex: -1,
  } as const

  // Rendered at the end of <body>: inside the page, an ancestor's transform
  // (its entrance animation) made `fixed` relative to that ancestor, and the
  // backdrop missed a strip at the top of the screen.
  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in"
        onClick={e => e.target === e.currentTarget && guardedClose()}
      >
        {/* Inline max-height, not a `vh` class: `vh` stays sized to the
           pre-keyboard viewport on many mobile browsers, so opening the
           keyboard on a field inside the sheet just overlaid it over
           whatever was at the bottom instead of the sheet shrinking to
           make room — this tracks the real visible height live instead. */}
        <div {...panelProps} className="bg-white w-full rounded-t-3xl shadow-2xl slide-up flex flex-col outline-none dark:bg-navy-900" style={{ maxHeight: viewportHeight * 0.88 }}>
          {/* The grab handle is only a visual cue; the backdrop and X close it. */}
          <div className="shrink-0 pt-2.5 pb-1 flex justify-center" aria-hidden>
            <div className="w-9 h-1 rounded-full bg-slate-200 dark:bg-navy-700" />
          </div>
          <div className="flex items-center justify-between px-5 pb-2 shrink-0">{header}</div>
          <div ref={contentRef} className="overflow-y-auto flex-1 px-5 pb-6">{children}</div>
        </div>
        {discard}
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/50 backdrop-blur-sm fade-in"
      onClick={e => e.target === e.currentTarget && guardedClose()}
    >
      <div {...panelProps} className={`bg-white w-full ${sizes[size]} rounded-2xl shadow-2xl fade-up flex flex-col max-h-[90vh] outline-none dark:bg-navy-900`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 dark:border-navy-800">{header}</div>
        <div ref={contentRef} className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
      {discard}
    </div>,
    document.body,
  )
}
