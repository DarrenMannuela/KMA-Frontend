import type { Invoice } from '@/types'

/** A Pelunasan's own `down_payment`/`remaining`/`ar_receivable` are a snapshot
 *  of its order's DP invoice taken when the Pelunasan was created (or last
 *  saved) — correcting the DP invoice afterwards doesn't touch them. Passing
 *  `allInvoices` (any caller that already has the full list — most do) makes
 *  every function below resolve the order's DP invoice live instead, so a
 *  late correction is reflected everywhere without having to re-save the
 *  Pelunasan. Omit it only when the full list truly isn't available; each
 *  function then falls back to the invoice's own stored fields exactly as
 *  before.
 *
 *  The live `down_payment` for this invoice's order: itself, if it is the DP
 *  invoice; its order's DP invoice's current value, via `allInvoices`;
 *  otherwise this invoice's own (possibly stale) stored value. */
export function liveDownPayment(inv: Invoice, allInvoices?: Invoice[]): number {
  if (inv.type === 'dp') return inv.down_payment ?? 0
  const dp = allInvoices?.find(i => i.order_id === inv.order_id && i.type === 'dp')
  return dp ? (dp.down_payment ?? 0) : (inv.down_payment ?? 0)
}

/** The amount this invoice document asks for. A DP invoice asks for its down
 *  payment; a full invoice (a DP of 0%) and a pelunasan ask for the balance
 *  after discount. Invoices saved before ar_receivable existed have 0 there:
 *  with no discount, their balance is `remaining`. */
export function invoiceAmount(inv: Invoice, allInvoices?: Invoice[]): number {
  const dp = liveDownPayment(inv, allInvoices)
  if (inv.type === 'dp' && dp > 0) return dp
  return balanceDue(inv, allInvoices)
}

/** What's left after the down payment, with any discount taken off. With
 *  `allInvoices`, recomputed live from the order's current DP amount rather
 *  than trusted from storage — see the module comment above. */
export function balanceDue(inv: Invoice, allInvoices?: Invoice[]): number {
  if (!allInvoices) {
    if (inv.ar_receivable) return inv.ar_receivable
    return inv.discount ? 0 : inv.remaining
  }
  const dp = liveDownPayment(inv, allInvoices)
  return Math.max(0, inv.total - dp - (inv.discount ?? 0))
}

/** A DP invoice with no down payment covers the whole order. */
export const isFullInvoice = (inv: Invoice) => inv.type === 'dp' && (inv.down_payment ?? 0) === 0
