import type { ClientItemPrice } from '@/types'

/** Sorts a client item's price history by year, then by effective_date within
 *  a year as a tie-break — a price can be revised mid-year, and year alone
 *  can't tell two same-year entries apart, so without the tie-break a
 *  same-year revision can sort ahead of (or behind) the entry it actually
 *  supersedes. Shared by ItemPriceHikeCalculator (wants the most recent
 *  entry first, 'desc') and ClientPriceListPrint (wants the full history in
 *  chronological order so it can pick off the last two, 'asc') — previously
 *  duplicated in both places with the same tie-break logic written twice. */
export function sortPricesByRecency(
  prices: ClientItemPrice[],
  direction: 'asc' | 'desc' = 'asc'
): ClientItemPrice[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...prices].sort((a, b) =>
    sign * (a.year - b.year) || sign * (a.effective_date ?? '').localeCompare(b.effective_date ?? '')
  )
}