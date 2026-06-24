import { ShoppingBag, Truck, Factory, Wrench, Users, TrendingUp, ArrowUpRight, Package } from 'lucide-react'
import { formatRp } from '@/components/ui'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, supplierHooks, invoiceHooks } from '@/hooks'
import { format } from 'date-fns'
import type { Order, Invoice, Production, Operation } from '@/types'

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  accent?: boolean
  sub?: string
}

function KpiCard({ label, value, icon: Icon, accent, sub }: KpiCardProps) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 ${
      accent
        ? 'bg-navy-900 text-white'
        : 'bg-white border border-slate-100 shadow-card'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-widest ${accent ? 'text-navy-400' : 'text-slate-400'}`}>
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-navy-800' : 'bg-slate-50'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-gold-400' : 'text-slate-400'}`} />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums leading-none ${accent ? 'text-white' : 'text-navy-900'}`}>
          {value}
        </p>
        {sub && <p className={`text-xs mt-1.5 ${accent ? 'text-navy-400' : 'text-slate-400'}`}>{sub}</p>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data: orders      = [] } = orderHooks.useList()
  const { data: deliveries  = [] } = deliveryHooks.useList()
  const { data: productions = [] } = productionHooks.useList()
  const { data: operations  = [] } = operationHooks.useList()
  const { data: suppliers   = [] } = supplierHooks.useList()
  const { data: invoices      = [] } = invoiceHooks.useList()

  const safeInvoices      = Array.isArray(invoices)      ? invoices      : []
  const safeProductions = Array.isArray(productions) ? productions : []
  const safeOperations  = Array.isArray(operations)  ? operations  : []
  const safeOrders      = Array.isArray(orders)      ? orders      : []

  const totalAR       = (safeInvoices as Invoice[]).reduce((s, r) => s + (r.ar_receivable ?? 0), 0)
  const totalProdCost = (safeProductions as Production[]).reduce((s, p) => s + (p.price * p.amount), 0)
  const totalOpsCost  = (safeOperations as Operation[]).reduce((s, o) => s + o.price, 0)
  const recentOrders  = (safeOrders as Order[]).slice(-5).reverse()
  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* AR spans 2 cols and is accented */}
        <div className="col-span-2">
          <KpiCard
            label="AR Receivable"
            value={formatRp(totalAR)}
            icon={TrendingUp}
            accent
            sub="Total outstanding receivables"
          />
        </div>
        <KpiCard label="Orders"          value={orders.length}       icon={ShoppingBag} sub="Total orders" />
        <KpiCard label="Deliveries"      value={deliveries.length}   icon={Truck}       sub="Total deliveries" />
        <KpiCard label="Production Cost" value={formatRp(totalProdCost)} icon={Factory} sub="Materials purchased" />
        <KpiCard label="Operations Cost" value={formatRp(totalOpsCost)}  icon={Wrench}  sub="Operational spend" />
      </div>

      {/* ── Second row: recent orders + supplier count ───────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Recent orders table — takes 3 cols */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-1">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-navy-400" />
              <h3 className="font-semibold text-navy-900 text-sm">Recent Orders</h3>
            </div>
            <a href="/orders" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium">
              View all <ArrowUpRight className="w-3 h-3" />
            </a>
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
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="flex flex-col items-center py-10 text-slate-300">
                        <Package className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm text-slate-400">No orders yet</p>
                        <p className="text-xs text-slate-300 mt-0.5">Orders will appear here once created</p>
                      </div>
                    </td>
                  </tr>
                ) : recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><span className="id-chip">{o.id}</span></td>
                    <td className="font-medium text-navy-900">{o.company ?? '—'}</td>
                    <td className="font-mono text-xs text-slate-500">{o.po_number ?? '—'}</td>
                    <td className="text-xs text-slate-500">
                      {o.date ? format(new Date(o.date), 'dd MMM yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: suppliers + quick links */}
        <div className="flex flex-col gap-3">
          {/* Supplier count */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Suppliers</span>
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-navy-900 tabular-nums">{suppliers.length}</p>
            <p className="text-xs text-slate-400 mt-1.5">Registered suppliers</p>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Quick Actions</p>
            <div className="space-y-1.5">
              {[
                { label: 'New Order',      href: '/orders',     icon: ShoppingBag },
                { label: 'New Delivery',   href: '/delivery',   icon: Truck },
                { label: 'Add Production', href: '/production', icon: Factory },
                { label: 'Add Supplier',   href: '/suppliers',  icon: Users },
              ].map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600
                             hover:bg-navy-900 hover:text-white transition-all duration-150 group"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-gold-400 transition-colors" />
                  {label}
                  <ArrowUpRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Financial summary (only when data exists) ────────── */}
      {(invoices as Invoice[]).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-4">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-navy-400" />
            <h3 className="font-semibold text-navy-900 text-sm">Financial Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="kma-table">
              <thead>
                <tr>
                  <th>Recap ID</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Down Payment</th>
                  <th>Remaining</th>
                  <th>AR Receivable</th>
                </tr>
              </thead>
              <tbody>
                {(invoices as Invoice[]).map((r) => (
                  <tr key={r.id}>
                    <td><span className="id-chip">{r.id}</span></td>
                    <td>{r.total}</td>
                    <td className="currency">{formatRp(r.total)}</td>
                    <td className="currency text-green-600">{formatRp(r.down_payment)}</td>
                    <td className="currency text-amber-600">{formatRp(r.remaining)}</td>
                    <td className="currency font-semibold text-red-600">{formatRp(r.ar_receivable)}</td>
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
