/** Helpers for thousands-grouped number inputs ("10,000"), keeping the state a
 *  plain digit string so the field can be emptied while typing. */

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