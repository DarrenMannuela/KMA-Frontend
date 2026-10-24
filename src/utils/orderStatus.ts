import type { Invoice } from '@/types'

export interface OrderStatus { label: string; className: string }

/** Where an order's payment stands, from its DP and pelunasan invoices. */
export function orderPaymentStatus(orderId: string, invoices: Invoice[]): OrderStatus {
  const own = invoices.filter(i => i.order_id === orderId)
  const dp = own.find(i => i.type === 'dp')
  const pelunasan = own.find(i => i.type === 'pelunasan')
  const full = dp && (dp.down_payment ?? 0) === 0
  if (!dp && !pelunasan) return { label: 'Not invoiced', className: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' }
  if (full) return dp!.status === 'paid'
    ? { label: 'Fully paid', className: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' }
    : { label: 'Awaiting payment', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' }
  if (dp && dp.status !== 'paid') return { label: 'Awaiting DP', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' }
  if (!pelunasan || pelunasan.status !== 'paid') return { label: 'Awaiting pelunasan', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' }
  return { label: 'Fully paid', className: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' }
}
