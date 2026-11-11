// Helpers for the app-wide keyboard shortcuts (see KeyboardShortcuts).

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** The modifier key's name as it's written on this computer's keyboard. */
export const MOD = isMac ? '⌘' : 'Ctrl'

/** Asks the app to open the "Jump to" box (from a button, say). */
export const openJumpTo = () => window.dispatchEvent(new Event('kma:jump-to'))
/** Asks the app to show the list of keyboard shortcuts. */
export const openShortcutsHelp = () => window.dispatchEvent(new Event('kma:shortcuts-help'))

/** A focused spreadsheet-style cell: its own keys (typing starts an edit)
 *  win over the app's single-key shortcuts. */
export const inCell = (el: Element | null) =>
  !!el && el !== document.body && !!el.closest('td, th, [role="gridcell"], .sheet-cell')

const visible = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement && el.getClientRects().length > 0

/** The first visible element marked `data-kbd="<name>"` on the page. */
export function findMarked(name: string): HTMLElement | null {
  return [...document.querySelectorAll(`[data-kbd="${name}"]`)].find(visible) ?? null
}
