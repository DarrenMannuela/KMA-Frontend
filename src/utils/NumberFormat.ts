/**
 * Helpers for comma-grouped number inputs (e.g. "10,000" instead of "10000")
 * while keeping the underlying state a plain digit string — same reasoning
 * as the raw-string price/qty fields elsewhere: converting to Number on
 * every keystroke breaks backspacing to blank, and here it'd also fight the
 * comma insertion while typing.
 */

/** Strips everything but digits — turns a comma-formatted display value back
 *  into the raw string that should actually be kept in state. */
export function stripCommas(value: string): string {
  return value.replace(/[^\d]/g, '')
}

/** Adds thousands separators for display, e.g. "10000" -> "10,000".
 *  Takes the raw digit string (not a parsed Number) so it works correctly
 *  mid-typing and doesn't reintroduce leading-zero/NaN issues. */
export function formatThousands(value: string): string {
  const digits = stripCommas(value)
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}