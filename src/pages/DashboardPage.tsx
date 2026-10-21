import { invoiceAmount } from '@/utils/invoiceAmount'
import { orderPaymentStatus } from '@/utils/orderStatus'
import { waLink, overdueReminderMessage, primaryContactPhone } from '@/utils/whatsapp'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { ShoppingBag, Truck, Factory, Wrench, Users, TrendingUp, ArrowUpRight, Package, AlertTriangle, Receipt, BarChart3, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatRp } from '@/components/ui'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, invoiceHooks, clientContactHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { format, differenceInCalendarDays } from 'date-fns'
import { isInMonth } from '@/utils/MonthUtils'
import { StackedBarChart } from '@/components/ui/Charts'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Order, Invoice, ProductionRow, OperationRow } from '@/types'

// Overdue from the day after the due date, in calendar days.
function daysOverdue(dueDate: string, now = new Date()): number {
  return differenceInCalendarDays(now, new Date(dueDate))
}
const isOverdue = (dueDate?: string | null) => !!dueDate && daysOverdue(dueDate) > 0

const invoiceAmountDue = invoiceAmount

const TYPE_BADGE: Record<string, string> = {
  dp:        'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  pelunasan: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
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
        : 'bg-white border border-slate-100 shadow-card dark:bg-navy-900 dark:border-navy-800'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-widest ${accent ? 'text-navy-300' : 'text-slate-500 dark:text-slate-400'}`}>
          {label}
        </span>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent ? 'bg-navy-800' : 'bg-slate-50 dark:bg-navy-950'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-gold-400' : 'text-slate-500 dark:text-slate-400'}`} />
        </div>
      </div>
      <div className="mt-auto min-w-0">
        <p className={`font-bold tabular-nums leading-tight ${KPI_VALUE_SIZE} ${accent ? 'text-white' : 'text-navy-900 dark:text-slate-50'}`}>
          {value}
        </p>
        {sub && <p className={`text-xs mt-1.5 ${accent ? 'text-navy-300' : 'text-slate-500 dark:text-slate-400'}`}>{sub}</p>}
      </div>
    </div>
  )
}

// Two metrics stacked in one KPI-sized card (Production + Operations cost).
function StackedCostCard({ top, bottom }: { top: KpiCardProps; bottom: KpiCardProps }) {
  return (
    <div className="h-full rounded-2xl bg-white border border-slate-100 shadow-card min-h-[160px] min-w-0 flex flex-col divide-y divide-slate-100 dark:bg-navy-900 dark:border-navy-800 dark:divide-navy-800">
      <StackedCostRow {...top} />
      <StackedCostRow {...bottom} />
    </div>
  )
}

function StackedCostRow({ label, value, icon: Icon, sub }: KpiCardProps) {
  return (
    <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 truncate dark:text-slate-400">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 dark:bg-navy-950">
          <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        </div>
      </div>
      <div className="mt-1 min-w-0">
        <p className="font-bold tabular-nums leading-tight text-lg text-navy-900 dark:text-slate-50">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5 truncate dark:text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const isMobile = useIsMobile()
  const orderQuery      = orderHooks.useList()
  const deliveryQuery   = deliveryHooks.useList()
  const productionQuery = productionHooks.useList()
  const operationQuery  = operationHooks.useList()
  const invoiceQuery    = invoiceHooks.useList()
  const contactQuery    = clientContactHooks.useList()
  const { data: orders      = [] } = orderQuery
  const { data: deliveries  = [] } = deliveryQuery
  const { data: productions = [] } = productionQuery
  const { data: operations  = [] } = operationQuery
  const { data: invoices      = [] } = invoiceQuery
  const { data: contacts      = [] } = contactQuery

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
    { key: 'paid',        label: t('common.paid'),        color: '#34d399' },
    { key: 'unpaid',       label: t('common.unpaid'),       color: '#f87171' },
    { key: 'production',  label: t('common.production'),  color: '#2dd4bf' },
    { key: 'operations',  label: t('common.operations'),  color: '#fbbf24' },
  ]
  const ordersVsCostsData = [
    { category: t('dashboard.ordersCategory'), values: { paid: paidThisMonth, unpaid: unpaidThisMonth } },
    { category: t('dashboard.costsCategory'),  values: { production: prodCostThisMonth, operations: opsCostThisMonth } },
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

  const orderInvoiceStatus = (orderId: string) => orderPaymentStatus(orderId, safeInvoices as Invoice[])

  // This month's costs against last month's, to the same day while it runs.
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const upToToday = (d: string) => Number(d.slice(8, 10)) <= now.getDate()
  const prodLastMonth = (safeProductions as ProductionRow[]).filter(p => isInMonth(p.date, lastMonth.getFullYear(), lastMonth.getMonth()) && upToToday(p.date)).reduce((s, p) => s + p.price * p.amount, 0)
  const opsLastMonth = (safeOperations as OperationRow[]).filter(o => isInMonth(o.date, lastMonth.getFullYear(), lastMonth.getMonth()) && upToToday(o.date)).reduce((s, o) => s + o.price, 0)
  const vsLastMonth = (nowAmt: number, before: number) => {
    const month = format(now, 'MMMM', { locale: dateLocale })
    if (!before) return t('dashboard.soFar', { month })
    const d = Math.round(((nowAmt - before) / before) * 100)
    return t('dashboard.soFarVsLastMonth', { month, arrow: d > 0 ? '▲' : d < 0 ? '▼' : '', percent: Math.abs(d) })
  }
  const ordersThisMonth = (safeOrders as Order[]).filter(o => isInMonth(o.date, now.getFullYear(), now.getMonth())).length
  const deliveriesThisMonth = deliveries.filter(d => isInMonth(d.date, now.getFullYear(), now.getMonth())).length

  if (isLoading) return <LoadingState label={t('dashboard.loading')} />
  if (isError) return <div className="p-4 md:p-6"><div className="card"><ErrorState what={t('dashboard.errorWhat')} onRetry={retryAll} /></div></div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">

      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* AR spans 2 cols and is accented */}
        <div className="col-span-2 h-full">
          <KpiCard
            label={t('dashboard.arReceivable')}
            value={formatRp(totalAR)}
            icon={TrendingUp}
            accent
            sub={t('dashboard.totalOutstandingReceivables')}
          />
        </div>
        <KpiCard label={t('dashboard.ordersThisMonth')} value={ordersThisMonth} icon={ShoppingBag} sub={t('common.inAllCount', { count: orders.length })} />
        <KpiCard label={t('dashboard.deliveriesThisMonth')} value={deliveriesThisMonth} icon={Truck} sub={t('common.inAllCount', { count: deliveries.length })} />
        {/* Production + Operations stacked in one card rather than two
            side-by-side cards — they're both "cost" figures and read
            fine as a compact pair instead of each claiming a full slot. */}
        {/* Two columns wide below xl: alone in a one-column slot it left an
            empty slot beside it (on phones and tablets) and cut its labels
            short ("PRODUCTIO…"). */}
        <div className="col-span-2 xl:col-span-1 h-full">
          <StackedCostCard
            top={{ label: t('common.production'), value: formatRp(prodCostThisMonth), icon: Factory, sub: vsLastMonth(prodCostThisMonth, prodLastMonth) }}
            bottom={{ label: t('common.operations'), value: formatRp(opsCostThisMonth), icon: Wrench, sub: vsLastMonth(opsCostThisMonth, opsLastMonth) }}
          />
        </div>
      </div>

      {/* ── Second row: recent orders + supplier count ───────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 xl:items-start">

        {/* Recent orders table — takes 3 cols */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-1 dark:bg-navy-900 dark:border-navy-800">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between dark:border-navy-800">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-navy-400" />
              <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('dashboard.recentOrders')}</h3>
            </div>
            <a href="/orders" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium">
              {t('common.viewAll')} <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-slate-300 dark:text-navy-700">
              <Package className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noOrdersYet')}</p>
              <p className="text-xs text-slate-300 mt-0.5 dark:text-navy-700">{t('dashboard.ordersWillAppearHere')}</p>
            </div>
          ) : isMobile ? (
            // Phone width: one card per order instead of the 5-column table.
            <div className="divide-y divide-slate-50 dark:divide-navy-800">
              {recentOrders.map((o) => {
                const status = orderInvoiceStatus(o.id)
                return (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                    className="w-full flex flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="id-chip">{o.id}</span>
                      <span className={`badge ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="font-medium text-navy-900 text-sm truncate dark:text-slate-50">{o.company ?? '—'}</div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono truncate">{o.po_number ?? '—'}</span>
                      <span className="whitespace-nowrap shrink-0">{o.date ? format(new Date(o.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}</span>
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
                    <th>{t('common.orderId')}</th>
                    <th>{t('common.company')}</th>
                    <th>{t('common.poNumber')}</th>
                    <th>{t('common.date')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => {
                    const status = orderInvoiceStatus(o.id)
                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                        onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                      >
                        <td><span className="id-chip">{o.id}</span></td>
                        <td className="font-medium text-navy-900 dark:text-slate-50">{o.company ?? '—'}</td>
                        <td className="font-mono text-xs text-slate-500 dark:text-slate-400">{o.po_number ?? '—'}</td>
                        <td className="text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                          {o.date ? format(new Date(o.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}
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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-1 dark:bg-navy-900 dark:border-navy-800">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-navy-400 shrink-0" />
              <h3 className="font-semibold text-navy-900 text-sm truncate dark:text-slate-50">{t('dashboard.ordersVsCosts', { month: format(now, 'MMMM', { locale: dateLocale }) })}</h3>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`font-semibold text-xs tabular-nums ${profitThisMonth >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {profitThisMonth >= 0 ? t('common.profit') : t('common.loss')}: {formatRp(Math.abs(profitThisMonth))}
              </span>
              <a href="/finance" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium shrink-0">
                {t('dashboard.yearly')} <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
            <StackedBarChart
              data={ordersVsCostsData}
              segments={ORDERS_VS_COSTS_SEGMENTS}
              height={110}
              maxBarWidth={80}
              emptyLabel={t('dashboard.noActivityThisMonth')}
            />
          </div>

          {/* Overdue invoices, oldest first; a click opens the invoice. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-2 dark:bg-navy-900 dark:border-navy-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('dashboard.overdueInvoices')}</span>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center dark:bg-red-500/10">
                <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
              </div>
            </div>
            {overdueInvoices.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-slate-300 dark:text-navy-700">
                <Receipt className="w-6 h-6 mb-1.5 opacity-40" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.nothingOverdue')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {overdueInvoices.slice(0, 4).map(inv => {
                  const days = daysOverdue(inv.due_date!, now)
                  const clientId = safeOrders.find(o => o.id === inv.order_id)?.client_id ?? null
                  const phone = primaryContactPhone(clientId, contacts)
                  const wa = waLink(phone, overdueReminderMessage({
                    clientName: inv.kepada_yth, invoiceId: inv.id, orderId: inv.order_id,
                    daysLate: days, amount: invoiceAmountDue(inv),
                  }))
                  return (
                    <div
                      key={inv.id}
                      className="w-full flex items-center justify-between gap-2 rounded-lg hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
                    >
                      {/* A separate control, not a link nested inside this one — two
                          interactive elements side by side, not one inside the other. */}
                      <button
                        type="button"
                        onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                        className="flex-1 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left min-w-0"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-navy-900 truncate dark:text-slate-50">{inv.kepada_yth}</span>
                          <span className="block text-xs text-red-600 dark:text-red-400">{t('dashboard.overdueBy', { count: days })}</span>
                        </span>
                        <span className="font-mono text-xs font-semibold text-navy-900 dark:text-slate-50 shrink-0">
                          {formatRp(invoiceAmountDue(inv))}
                        </span>
                      </button>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('dashboard.remindOnWhatsapp')}
                          className="w-6 h-6 mr-2 rounded-md flex items-center justify-center text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 transition-colors shrink-0"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )
                })}
                {overdueInvoices.length > 4 && (
                  <p className="text-xs text-slate-500 pt-1 px-2 dark:text-slate-400">{t('common.moreCount', { count: overdueInvoices.length - 4 })}</p>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-3 dark:bg-navy-900 dark:border-navy-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 dark:text-slate-400">{t('dashboard.quickActions')}</p>
            <div className="space-y-1.5">
              {[
                { label: t('dashboard.newOrder'),      href: '/orders',     icon: ShoppingBag },
                { label: t('dashboard.newDelivery'),   href: '/delivery',   icon: Truck },
                { label: t('dashboard.addProduction'), href: '/production', icon: Factory },
                { label: t('dashboard.addSupplier'),  href: '/suppliers',  icon: Users },
                { label: t('dashboard.finance'),  href: '/finance', icon: BarChart3 },
              ].map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300
                             hover:bg-navy-900 hover:text-white transition-all duration-150 group"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 group-hover:text-gold-400 transition-colors" />
                  {label}
                  <ArrowUpRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── AR Receivable breakdown ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-4 dark:bg-navy-900 dark:border-navy-800">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between dark:border-navy-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-navy-400" />
            <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('dashboard.arBreakdown')}</h3>
          </div>
          <a href="/invoice" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800 transition-colors font-medium">
            {t('common.viewAll')} <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        {arBreakdown.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-300 dark:text-navy-700">
            <Receipt className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noOutstandingReceivables')}</p>
            <p className="text-xs text-slate-300 mt-0.5 dark:text-navy-700">{t('dashboard.everythingPaidUp')}</p>
          </div>
        ) : isMobile ? (
          // Phone width: cards, with who and how much on the first line.
          <div className="divide-y divide-slate-50 dark:divide-navy-800">
            {arBreakdown.slice(0, 6).map(inv => {
              const overdue = isOverdue(inv.due_date)
              return (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                  className="w-full flex flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="id-chip font-mono">{inv.id}</span>
                    <span className={`badge ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                      {inv.type === 'dp' ? t('common.downPayment') : 'Pelunasan'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-navy-900 text-sm truncate dark:text-slate-50">{inv.kepada_yth}</span>
                    <span className="currency font-semibold text-sm shrink-0">{formatRp(invoiceAmountDue(inv))}</span>
                  </div>
                  <div className={`text-xs ${overdue ? 'text-red-600 font-semibold dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}
                    {overdue && ` ${t('dashboard.overdueParenthetical')}`}
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
                  <th>{t('common.invoiceNo')}</th>
                  <th>{t('common.client')}</th>
                  <th>{t('common.type')}</th>
                  <th>{t('dashboard.amountDue')}</th>
                  <th>{t('common.dueDate')}</th>
                </tr>
              </thead>
              <tbody>
                {arBreakdown.slice(0, 6).map(inv => {
                  const overdue = isOverdue(inv.due_date)
                  return (
                    <tr
                      key={inv.id}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                      onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                    >
                      <td><span className="id-chip font-mono">{inv.id}</span></td>
                      <td className="font-medium text-navy-900 dark:text-slate-50">{inv.kepada_yth}</td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                          {inv.type === 'dp' ? t('common.downPayment') : 'Pelunasan'}
                        </span>
                      </td>
                      <td className="currency font-semibold">{formatRp(invoiceAmountDue(inv))}</td>
                      <td className={`text-xs ${overdue ? 'text-red-600 font-semibold dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        <span className="whitespace-nowrap">{inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}</span>
                        {overdue && ` ${t('dashboard.overdueParenthetical')}`}
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