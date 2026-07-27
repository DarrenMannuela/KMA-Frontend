export function isInMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year && d.getMonth() === month
}

/** Same idea as isInMonth, one level up — used by the Yearly Report page,
 *  which buckets by year+month together rather than filtering to one
 *  month at a time. */
export function isInYear(dateStr: string | null | undefined, year: number): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year
}

/** Which 0-11 month a date string falls in, or null if it's missing/invalid.
 *  Used to bucket a year's worth of records into their 12 months for the
 *  Yearly Report's charts. */
export function monthIndexOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.getMonth()
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Short 3-letter month name for chart axis labels, e.g. "Jan". Separate
 *  from the all-caps MONTH_NAMES below (used for date formatting), since
 *  chart labels read better in normal case, not shouty-caps. */
export function shortMonthLabel(month: number): string {
  return new Date(2000, month, 1).toLocaleDateString('en-US', { month: 'short' })
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return '—'
  const [, year, month, day] = match
  const monthName = MONTH_NAMES[Number(month) - 1]
  if (!monthName) return '—'
  return `${day}/${monthName}/${year.slice(-2)}`
}