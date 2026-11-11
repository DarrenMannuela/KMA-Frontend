import { useEffect, useRef } from 'react'

// Open dialogs, innermost last: only the top one answers Escape and keeps Tab,
// so a ConfirmDialog over a Modal closes alone.
const stack: object[] = []

/** Whether any dialog is open (app-wide shortcuts stay quiet while one is). */
export const anyDialogOpen = () => stack.length > 0

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Dialog keyboard behaviour: focus moves in on open (to `initialFocus`, or
 *  the panel itself, never an input, so a phone keyboard doesn't pop up
 *  uninvited), Tab stays inside, Escape calls `onEscape` unless something
 *  inside already handled it (an EditableCell cancelling its own edit), and
 *  focus goes back where it was on close. */
export function useDialog(
  panelRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
  initialFocus?: React.RefObject<HTMLElement | null>,
) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    const token = {}
    stack.push(token)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    // A field with autoFocus has already taken focus by now; leave it there.
    if (panel && !panel.contains(document.activeElement)) {
      (initialFocus?.current ?? panel).focus({ preventScroll: true })
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token || !panel) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        e.preventDefault()
        onEscapeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !panel.contains(active) || active === panel
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
