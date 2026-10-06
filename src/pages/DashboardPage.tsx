import { invoiceAmount } from '@/utils/invoiceAmount'
import { ShoppingBag, Truck, Factory, Wrench, Users, TrendingUp, ArrowUpRight, Package, AlertTriangle, Receipt, BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatRp, Spinner } from '@/components/ui'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, invoiceHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { format, differenceInCalendarDays } from 'date-fns'
import { isInMonth } from '@/utils/MonthUtils'
import { StackedBarChart } from '@/components/ui/Charts'
import type { Order, Invoice, ProductionRow, OperationRow } from '@/types'

// Overdue from the day after the due date, in calendar days.
function daysOverdue(dueDate: string, now = new Date()): number {
  return differenceInCalendarDays(now, new Date(dueDate))
}
const isOverdue = (dueDate?: string | null) => !!dueDate && daysOverdue(dueDate) > 0

const invoiceAmountDue = invoiceAmount

const TYPE_BADGE: Record<string, string> = {
  dp:        'bg-blue-50 text-blue-700',
  pelunasan: 'bg-purple-50 text-purple-700',
}

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  accent?: boolean
  sub?: string
}

// One value size for every KPI card. No break-words: a long value wraps between
// "Rp" and the number, never mid-digit.
const KPI_VALUE_SIZE = 'text-2xl'

function KpiCard({ label, value, icon: Icon, accent, sub }: KpiCardProps) {
  return (
    // mt-auto keeps every card's value on the same baseline, however it wraps.
    <div className={`h-full rounded-2xl p-6 flex flex-col gap-4 min-h-[160px] min-w-0 ${
      accent
        ? 'bg-navy-900 text-white'
        : 'bg-white border border-slate-100 shadow-card'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-widest ${accent ? 'text-navy-400' : 'text-slate-400'}`}>
          {label}
        </span>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent ? 'bg-navy-800' : 'bg-slate-50'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-gold-400' : 'text-slate-400'}`} />
        </div>
      </div>
      <div className="mt-auto min-w-0">
        <p className={`font-bold tabular-nums leading-tight ${KPI_VALUE_SIZE} ${accent ? 'text-white' : 'text-navy-900'}`}>
          {value}
        </p>
        {sub && <p className={`text-xs mt-1.5 ${accent ? 'text-navy-400' : 'text-slate-400'}`}>{sub}</p>}
      </div>
    </div>
  )
}

// Two metrics stacked in one KPI-sized card (Production + Operations cost).
function StackedCostCard({ top, bottom }: { top: KpiCardProps; bottom: KpiCardProps }) {
  return (
    <div className="h-full rounded-2xl bg-white border border-slate-100 shadow-card min-h-[160px] min-w-0 flex flex-col divide-y divide-slate-100">
      <StackedCostRow {...top} />
      <StackedCostRow {...bottom} />
    </div>
  )
}

function StackedCostRow({ label, value, icon: Icon, sub }: KpiCardProps) {
  return (
    <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 truncate">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>
      <div className="mt-1 min-w-0">
        <p className="font-bold tabular-nums leading-tight text-lg text-navy-900">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const orderQuery      = orderHooks.useList()
  const deliveryQuery   = deliveryHooks.useList()
  const productionQuery = productionHooks.useList()
  const operationQuery  = operationHooks.useList()
  const invoiceQuery    = invoiceHooks.useList()
  const { data: orders      = [] } = orderQuery
  const { data: deliveries  = [] } = deliveryQuery
  const { data: productions = [] } = productionQuery
  const { data: operations  = [] } = operationQuery
  const { data: invoices      = [] } = invoiceQuery

  // A failed query blocks the page: a silent "Rp 0" would look like all clear.
  const dashboardQueries = [orderQuery, deliveryQuery, productionQuery, operationQuery, invoiceQuery]
  const isLoading = dashboardQueries.some(q => q.isLoading)
  const isError   = dashboardQueries.some(q => q.isError)
  const retryAll  = () => dashboardQueries.forEach(q => q.refetch())

  const safeInvoices      = Array.isArray(invoices)      ? invoices      : []
  const safeProductions = Array.isArray(productions) ? productions : []
  const safeOperations  = Array.isArray(operations)  ? operations  : []
  const safeOrders      = Array.isArray(orders)      ? orders      : []

  // Only unpaid invoices are actually "outstanding" — a paid invoice's
  // ar_receivable was real money owed at the time, but once status flips
  // to paid it shouldn't keep inflating this KPI.
  const unpaidInvoices = (safeInvoices as Invoice[]).filter(i => i.status !== 'paid')
  const totalAR       = unpaidInvoices.reduce((s, r) => s + invoiceAmountDue(r), 0)
  const totalProdCost = (safeProductions as ProductionRow[]).reduce((s, p) => s + (p.price * p.amount), 0)
  const totalOpsCost  = (safeOperations as OperationRow[]).reduce((s, o) => s + o.price, 0)
  const recentOrders  = (safeOrders as Order[]).slice(-5).reverse()

  // ── This month: orders vs costs on one scale; the gap is the profit ──
  const now = new Date()
  const prodThisMonth = (safeProductions as ProductionRow[]).filter(p => isInMonth(p.date, now.getFullYear(), now.getMonth()))
  const opsThisMonth  = (safeOperations as OperationRow[]).filter(o => isInMonth(o.date, now.getFullYear(), now.getMonth()))
  const prodCostThisMonth = prodThisMonth.reduce((s, p) => s + p.price * p.amount, 0)
  const opsCostThisMonth  = opsThisMonth.reduce((s, o) => s + o.price, 0)
  const costThisMonthTotal = prodCostThisMonth + opsCostThisMonth

  const invoicesThisMonth = (safeInvoices as Invoice[]).filter(i => isInMonth(i.tanggal, now.getFullYear(), now.getMonth()))
  const paidThisMonth   = invoicesThisMonth.filter(i => i.status === 'paid').reduce((s, i) => s + invoiceAmountDue(i), 0)
  const unpaidThisMonth = invoicesThisMonth.filter(i => i.status !== 'paid').reduce((s, i) => s + invoiceAmountDue(i), 0)
  const invoicedThisMonthTotal = paidThisMonth + unpaidThisMonth

  const profitThisMonth = invoicedThisMonthTotal - costThisMonthTotal

  // One segment list for both bars: orders fill paid/unpaid, costs fill
  // production/operations.
  const ORDERS_VS_COSTS_SEGMENTS = [
    { key: 'paid',        label: 'Paid',        color: '#34d399' },
    { key: 'unpaid',       label: 'Unpaid',       color: '#f87171' },
    { key: 'production',  label: 'Production',  color: '#2dd4bf' },
    { key: 'operations',  label: 'Operations',  color: '#fbbf24' },
  ]
  const ordersVsCostsData = [
    { category: 'Orders', values: { paid: paidThisMonth, unpaid: unpaidThisMonth } },
    { category: 'Costs',  values: { production: prodCostThisMonth, operations: opsCostThisMonth } },
  ]

  // Overdue first (oldest due date first), then upcoming, then no due date.
  const arBreakdown = [...unpaidInvoices].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

  // The overdue part, oldest first; the same rule as the Overdue KPI.
  const overdueInvoices = arBreakdown.filter(i => isOverdue(i.due_date))

  // An order's invoice status, from its 0-2 invoices (DP and pelunasan).
  function orderInvoiceStatus(orderId: string): { label: string; className: string } {
    const orderInvoices = (safeInvoices as Invoice[]).filter(i => i.order_id === orderId)
    const dp = orderInvoices.find(i => i.type === 'dp')
    const pelunasan = orderInvoices.find(i => i.type === 'pelunasan')

    if (!dp) return { label: 'Not Invoiced', className: 'bg-slate-100 text-slate-500' }
    if (dp.status !== 'paid') return { label: 'Awaiting DP', className: 'bg-red-50 text-red-600' }
    if (!pelunasan) return { label: 'Awaiting Pelunasan', className: 'bg-amber-50 text-amber-600' }
    if (pelunasan.status !== 'paid') return { label: 'Awaiting Pelunasan', className: 'bg-amber-50 text-amber-600' }
    return { label: 'Fully Paid', className: 'bg-green-50 text-green-700' }
  }

  if (isLoading) {
    return <Spinner />
  }
  if (isError) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
        <p className="text-red-400 mb-3">Couldn't load dashboard data — check your connection and try again.</p>
        <button onClick={retryAll} className="btn-secondary">Retry</button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* AR spans 2 cols and is accented */}
        <div className="col-span-2 h-full">
          <KpiCard
            label="AR Receivable"
            value={formatRp(totalAR)}
            icon={TrendingUp}
            accent
            sub="Total outstanding receivables"
          />
        </div>
        <KpiCard label="Orders"      value={orders.length}     icon={ShoppingBag} sub="Total orders" />
        <KpiCard label="Deliveries"  value={deliveries.length} icon={Truck}       sub="Total deliveries" />
        {/* Production + Operations stacked in one card rather than two
            side-by-side cards — they're both "cost" figures and read
            fine as a compact pair instead of each claiming a full slot. */}
        {/* Two columns wide below xl: alone in a one-column slot it left an
            empty slot beside it (on phones and tablets) and cut its labels
            short ("PRODUCTIO…"). */}
        <div className="col-span-2 xl:col-span-1 h-full">
          <StackedCostCard
            top={{ label: 'Production Cost', value: formatRp(totalProdCost), icon: Factory, sub: 'Materials purchased' }}
            bottom={{ label: 'Operations Cost', value: formatRp(totalOpsCost), icon: Wrench, sub: 'Operational spend' }}
          />
        </div>
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
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-slate-300">
              <Package className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm text-slate-400">No orders yet</p>
              <p className="text-xs text-slate-300 mt-0.5">Orders will appear here once created</p>
            </div>
          ) : isMobile ? (
            // Phone width: one card per order instead of the 5-column table.
            <div className="divide-y divide-slate-50">
              {recentOrders.map((o) => {
                const status = orderInvoiceStatus(o.id)
                return (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                    className="w-full flex flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="id-chip">{o.id}</span>
                      <span className={`badge ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="font-medium text-navy-900 text-sm truncate">{o.company ?? '—'}</div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono truncate">{o.po_number ?? '—'}</span>
                      <span className="whitespace-nowrap shrink-0">{o.date ? format(new Date(o.date), 'dd MMM yyyy') : '—'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="kma-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Company</th>
                    <th>PO Number</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => {
                    const status = orderInvoiceStatus(o.id)
                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                      >
                        <td><span className="id-chip">{o.id}</span></td>
                        <td className="font-medium text-navy-900">{o.company ?? '—'}</td>
                        <td className="font-mono text-xs text-slate-500">{o.po_number ?? '—'}</td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">
                          {o.date ? format(new Date(o.date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td>
                          <span className={`badge ${status.className}`}>{status.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column: this month's chart + overdue invoices + quick links */}
        <div className="flex flex-col gap-3">
          {/* Orders vs Costs, this month. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-1">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-navy-400 shrink-0" />
              <h3 className="font-semibold text-navy-900 text-sm truncate">{format(now, 'MMMM')} — Orders vs Costs</h3>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`font-semibold text-xs tabular-nums ${profitThisMonth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {profitThisMonth >= 0 ? 'Profit' : 'Loss'}: {formatRp(Math.abs(profitThisMonth))}
              </span>
              <a href="/finance" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium shrink-0">
                Yearly <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
            <StackedBarChart
              data={ordersVsCostsData}
              segments={ORDERS_VS_COSTS_SEGMENTS}
              height={110}
              maxBarWidth={80}
              emptyLabel="No activity yet this month"
            />
          </div>

          {/* Overdue invoices, oldest first; a click opens the invoice. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Overdue Invoices</span>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
            </div>
            {overdueInvoices.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-slate-300">
                <Receipt className="w-6 h-6 mb-1.5 opacity-40" />
                <p className="text-xs text-slate-400">Nothing overdue</p>
              </div>
            ) : (
              <div className="space-y-1">
                {overdueInvoices.slice(0, 4).map(inv => {
                  const days = daysOverdue(inv.due_date!, now)
                  return (
                    <button
                      key={inv.id}
                      onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left
                                 hover:bg-slate-50 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-navy-900 truncate">{inv.kepada_yth}</span>
                        <span className="block text-xs text-red-600">{days === 1 ? '1 day' : `${days} days`} overdue</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-navy-900 shrink-0">
                        {formatRp(invoiceAmountDue(inv))}
                      </span>
                    </button>
                  )
                })}
                {overdueInvoices.length > 4 && (
                  <p className="text-xs text-slate-400 pt-1 px-2">+{overdueInvoices.length - 4} more</p>
                )}
              </div>
            )}
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
                { label: 'Finance',  href: '/finance', icon: BarChart3 },
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

      {/* ── AR Receivable breakdown ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-4">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-navy-400" />
            <h3 className="font-semibold text-navy-900 text-sm">AR Receivable Breakdown</h3>
          </div>
          <a href="/invoice" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium">
            View all <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        {arBreakdown.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-300">
            <Receipt className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm text-slate-400">No outstanding receivables</p>
            <p className="text-xs text-slate-300 mt-0.5">Everything's paid up</p>
          </div>
        ) : isMobile ? (
          // Phone width: cards, with who and how much on the first line.
          <div className="divide-y divide-slate-50">
            {arBreakdown.slice(0, 6).map(inv => {
              const overdue = isOverdue(inv.due_date)
              return (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                  className="w-full flex flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="id-chip font-mono">{inv.id}</span>
                    <span className={`badge ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {inv.type === 'dp' ? 'Down Payment' : 'Pelunasan'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-navy-900 text-sm truncate">{inv.kepada_yth}</span>
                    <span className="currency font-semibold text-sm shrink-0">{formatRp(invoiceAmountDue(inv))}</span>
                  </div>
                  <div className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                    {inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy') : '—'}
                    {overdue && ' (overdue)'}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="kma-table">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Amount Due</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {arBreakdown.slice(0, 6).map(inv => {
                  const overdue = isOverdue(inv.due_date)
                  return (
                    <tr
                      key={inv.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                    >
                      <td><span className="id-chip font-mono">{inv.id}</span></td>
                      <td className="font-medium text-navy-900">{inv.kepada_yth}</td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-600'}`}>
                          {inv.type === 'dp' ? 'Down Payment' : 'Pelunasan'}
                        </span>
                      </td>
                      <td className="currency font-semibold">{formatRp(invoiceAmountDue(inv))}</td>
                      <td className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        <span className="whitespace-nowrap">{inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy') : '—'}</span>
                        {overdue && ' (overdue)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}