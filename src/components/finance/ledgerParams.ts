import type { LedgerFilters } from './Ledger'
import type { Period } from './ledgerModel'
import { currentPeriod } from './PeriodPicker'

// The sheet's starting filters travel in the URL (?view=sheet&group=12&period=2026-10),
// so Back returns to the dashboard and other pages can link to a filtered sheet.

export function periodParam(p: Pick<Period, 'mode' | 'year' | 'month'>): string {
  if (p.mode === 'year') return String(p.year)
  if (p.mode === 'all') return 'all'
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}`
}

export function filtersFromParams(params: URLSearchParams): Partial<LedgerFilters> {
  const out: Partial<LedgerFilters> = {}
  const period = params.get('period')
  if (period === 'all') out.period = currentPeriod('all')
  else if (period && /^\d{4}$/.test(period)) out.period = { ...currentPeriod('year'), year: Number(period) }
  else if (period && /^\d{4}-\d{2}$/.test(period)) out.period = { ...currentPeriod('month'), year: Number(period.slice(0, 4)), month: Number(period.slice(5)) - 1 }
  if (params.get('group')) out.group = params.get('group')!
  if (params.get('q')) out.q = params.get('q')!
  if (params.get('order')) out.order = params.get('order')!
  return out
}

export function sheetParams(f: { group?: string; period?: string; q?: string; order?: string }): Record<string, string> {
  const out: Record<string, string> = { view: 'sheet' }
  for (const [k, v] of Object.entries(f)) if (v) out[k] = v
  return out
}
