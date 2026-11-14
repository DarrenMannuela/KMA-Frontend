import i18n from '@/i18n/config'
import type { Invoice } from '@/types'
import { todayISODate } from '@/utils/MonthUtils'

export interface OrderStatus { label: string; className: string }

// Colour by meaning (Carbon's status semantics): grey = not started, blue =
// in progress, red only for a real problem (an invoice past its due date),
// green = done. Always with its words, never colour alone.
const TONE = {
  notStarted: 'badge-slate',
  inProgress: 'badge-blue',
  problem: 'badge-red',
  done: 'badge-green',
  // A cancelled order: struck off, not a problem to chase.
  cancelled: 'badge-slate line-through decoration-slate-400',
}

/** An unpaid invoice whose due date has gone by (from the day after it). */
export const isPastDue = (inv: Pick<Invoice, 'status' | 'due_date'>) =>
  inv.status === 'unpaid' && !!inv.due_date && inv.due_date.slice(0, 10) < todayISODate()

const status = (key: string, tone: keyof typeof TONE): OrderStatus =>
  ({ label: i18n.t(`dashboardKpi.paymentStatus.${key}`), className: TONE[tone] })

/** Where an order's payment stands, from its DP and pelunasan invoices. */
export function orderPaymentStatus(orderId: string, invoices: Invoice[], cancelled = false): OrderStatus {
  if (cancelled) return status('cancelled', 'cancelled')
  const own = invoices.filter(i => i.order_id === orderId)
  const dp = own.find(i => i.type === 'dp')
  const pelunasan = own.find(i => i.type === 'pelunasan')
  const full = dp && (dp.down_payment ?? 0) === 0
  if (!dp && !pelunasan) return status('notInvoiced', 'notStarted')
  if (full) {
    if (dp!.status === 'paid') return status('fullyPaid', 'done')
    return isPastDue(dp!) ? status('paymentOverdue', 'problem') : status('awaitingPayment', 'inProgress')
  }
  if (dp && dp.status !== 'paid') return isPastDue(dp) ? status('dpOverdue', 'problem') : status('awaitingDp', 'inProgress')
  if (!pelunasan || pelunasan.status !== 'paid') {
    return pelunasan && isPastDue(pelunasan) ? status('pelunasanOverdue', 'problem') : status('awaitingPelunasan', 'inProgress')
  }
  return status('fullyPaid', 'done')
}
