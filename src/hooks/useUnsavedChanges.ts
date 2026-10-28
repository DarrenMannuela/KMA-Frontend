import { useEffect, useRef } from 'react'

const DRAFT_PREFIX = 'kma.draft.'

/** Reads a saved draft for `key`, if any. Call inside a useState initializer
 *  to have a form ready to seed itself from it — see useAutosaveDraft below,
 *  which is what saves it there in the first place. */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch { /* private mode / storage unavailable — nothing to clean up */ }
}

/** Removes every autosaved draft, regardless of key — call on logout so a
 *  different account signing in on the same browser never gets offered a
 *  draft that wasn't theirs. */
export function clearAllDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k)
    }
  } catch { /* private mode / storage unavailable */ }
}

/** Saves `value` to localStorage under `key` shortly after it changes
 *  (debounced, so fast typing doesn't write on every keystroke), so a
 *  crashed tab or a closed browser doesn't take unsaved form input with it —
 *  loadDraft above recovers it the next time the form opens. Pass `skip`
 *  true while there's nothing worth saving (e.g. editing an existing record
 *  rather than drafting a new one). Call clearDraft(key) once the form
 *  actually saves, so a stale draft doesn't get offered back next time. */
export function useAutosaveDraft<T>(key: string, value: T, skip = false) {
  useEffect(() => {
    if (skip) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value))
      } catch { /* private mode / storage full — autosave just doesn't happen this time */ }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip, JSON.stringify(value)])
}

/** True once `value` has changed from what it was on mount. Works for any
 *  plain-object/string form state with no per-form wiring — just pass the
 *  state object in. */
export function useIsDirty<T>(value: T): boolean {
  const initial = useRef(value)
  return JSON.stringify(value) !== JSON.stringify(initial.current)
}

/** Warns before losing unsaved form input, two ways:
 *   - the browser tab closing, reloading or navigating to a typed URL, via
 *     the native beforeunload prompt (it can't be styled — the browser shows
 *     its own dialog regardless of what we pass it);
 *   - an in-app close, via the `guardClose` this returns. Every modal in this
 *     app closes through one `onClose` (backdrop click, the X button and
 *     Escape all call it — see Modal.tsx), so wrapping that one call site
 *     covers all three the same way.
 *  Pass a form's live `isDirty` (see useIsDirty); re-renders don't re-wire
 *  the listener, so this is cheap to use in every form. */
export function useUnsavedChanges(isDirty: boolean, onDiscard?: () => void) {
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const guardClose = (close: () => void) => {
    if (isDirtyRef.current && !window.confirm('Discard unsaved changes?')) return
    // Every path that discards instead of saving (Cancel, X, Escape,
    // backdrop — they all funnel through this one guard) must not leave a
    // stale autosaved draft behind for the next person to be offered.
    onDiscard?.()
    close()
  }

  return { guardClose }
}
