import type { ClientItemPrice } from '@/types'

/** Sorts a price history by year, then effective_date (a price can be revised
 *  mid-year). 'desc' for the newest first, 'asc' for chronological. */
export function sortPricesByRecency(
  prices: ClientItemPrice[],
  direction: 'asc' | 'desc' = 'asc'
): ClientItemPrice[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...prices].sort((a, b) =>
    sign * (a.year - b.year) || sign * (a.effective_date ?? '').localeCompare(b.effective_date ?? '')
  )
}
/** The price that applies in a year: that year's, or else the latest before
 *  it (a price set for next year doesn't apply yet). */
export function priceForYear(prices: ClientItemPrice[], year: number): ClientItemPrice | undefined {
  return sortPricesByRecency(prices, 'desc').find(p => p.year <= year)
}
