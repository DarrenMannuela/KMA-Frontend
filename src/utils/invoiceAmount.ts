import type { Invoice } from '@/types'

/** The amount this invoice document asks for. A DP invoice asks for its down
 *  payment; a full invoice (a DP of 0%) and a pelunasan ask for the balance
 *  after discount. Invoices saved before ar_receivable existed have 0 there:
 *  with no discount, their balance is `remaining`. */
export function invoiceAmount(inv: Invoice): number {
  if (inv.type === 'dp' && (inv.down_payment ?? 0) > 0) return inv.down_payment ?? 0
  return balanceDue(inv)
}

/** What's left after the down payment, with any discount taken off. */
export function balanceDue(inv: Invoice): number {
  if (inv.ar_receivable) return inv.ar_receivable
  return inv.discount ? 0 : inv.remaining
}

/** A DP invoice with no down payment covers the whole order. */
export const isFullInvoice = (inv: Invoice) => inv.type === 'dp' && (inv.down_payment ?? 0) === 0
