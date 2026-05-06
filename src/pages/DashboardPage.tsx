import { ShoppingBag, Truck, Factory, Wrench, Users, TrendingUp } from 'lucide-react'
import { StatCard, formatRp } from '@/components/ui'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, supplierHooks, recapHooks } from '@/hooks'
import { format } from 'date-fns'
import type { Order, OrderRecap, Production, Operation } from '@/types'

export function DashboardPage() {
  const { data: orders     = [] } = orderHooks.useList()
  const { data: deliveries = [] } = deliveryHooks.useList()
  const { data: productions = [] } = productionHooks.useList()
  const { data: operations  = [] } = operationHooks.useList()
  const { data: suppliers   = [] } = supplierHooks.useList()
  const { data: recaps      = [] } = recapHooks.useList()

  const totalAR     = (recaps as OrderRecap[]).reduce((s, r) => s + (r.ar_receivable ?? 0), 0)
  const totalProdCost = (productions as Production[]).reduce((s, p) => s + (p.price * p.amount), 0)
  const totalOpsCost  = (operations as Operation[]).reduce((s, o) => s + o.price, 0)

  const recentOrders = (orders as Order[]).slice(-5).reverse()

  return (
    <div className="p-6 space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="xl:col-span-2">
          <StatCard label="AR Receivable" value={formatRp(totalAR)} icon={TrendingUp} accent />
        </div>
        <StatCard label="Total Orders"     value={orders.length}       icon={ShoppingBag} />
        <StatCard label="Deliveries"       value={deliveries.length}   icon={Truck} />
        <StatCard label="Production Cost"  value={formatRp(totalProdCost)} icon={Factory} />
        <StatCard label="Operations Cost"  value={formatRp(totalOpsCost)}  icon={Wrench} />
        <StatCard label="Suppliers"        value={suppliers.length}    icon={Users} />
      </div>

      {/* Recent orders */}
      <div className="card fade-up delay-2">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-navy-900 text-sm">Recent Orders</h3>
          <a href="/orders" className="text-xs text-navy-500 hover:text-navy-800 transition-colors">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="kma-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Company</th>
                <th>PO Number</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400 text-xs">No orders yet</td></tr>
              )}
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td><span className="id-chip">{o.id}</span></td>
                  <td className="font-medium text-navy-900">{o.company ?? '—'}</td>
                  <td className="font-mono text-xs text-slate-500">{o.po_number ?? '—'}</td>
                  <td className="text-xs text-slate-500">{o.date ? format(new Date(o.date), 'dd MMM yyyy') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recap summary */}
      {(recaps as OrderRecap[]).length > 0 && (
        <div className="card fade-up delay-3">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-navy-900 text-sm">Financial Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="kma-table">
              <thead>
                <tr>
                  <th>Recap ID</th>
                  <th>Total Items</th>
                  <th>Amount</th>
                  <th>Down Payment</th>
                  <th>Remaining</th>
                  <th>AR Receivable</th>
                </tr>
              </thead>
              <tbody>
                {(recaps as OrderRecap[]).map((r) => (
                  <tr key={r.id}>
                    <td><span className="id-chip">{r.id}</span></td>
                    <td>{r.total}</td>
                    <td className="currency">{formatRp(r.amount)}</td>
                    <td className="currency text-green-600">{formatRp(r.down_payment)}</td>
                    <td className="currency text-amber-600">{formatRp(r.remaining)}</td>
                    <td className="currency text-red-600">{formatRp(r.ar_receivable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
