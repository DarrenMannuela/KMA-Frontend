export function isInMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year && d.getMonth() === month
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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