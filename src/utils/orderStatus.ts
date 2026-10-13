import type { Invoice } from '@/types'

export interface OrderStatus { label: string; className: string }

/** Where an order's payment stands, from its DP and pelunasan invoices. */
export function orderPaymentStatus(orderId: string, invoices: Invoice[]): OrderStatus {
  const own = invoices.filter(i => i.order_id === orderId)
  const dp = own.find(i => i.type === 'dp')
  const pelunasan = own.find(i => i.type === 'pelunasan')
  const full = dp && (dp.down_payment ?? 0) === 0
  if (!dp && !pelunasan) return { label: 'Not invoiced', className: 'bg-slate-100 text-slate-500' }
  if (full) return dp!.status === 'paid'
    ? { label: 'Fully paid', className: 'bg-green-50 text-green-700' }
    : { label: 'Awaiting payment', className: 'bg-red-50 text-red-600' }
  if (dp && dp.status !== 'paid') return { label: 'Awaiting DP', className: 'bg-red-50 text-red-600' }
  if (!pelunasan || pelunasan.status !== 'paid') return { label: 'Awaiting pelunasan', className: 'bg-amber-50 text-amber-600' }
  return { label: 'Fully paid', className: 'bg-green-50 text-green-700' }
}
