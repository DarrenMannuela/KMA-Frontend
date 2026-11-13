import { changeLabel } from '@/utils/changeLabel'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { invoiceAmount } from '@/utils/invoiceAmount'
import { orderPaymentStatus } from '@/utils/orderStatus'
import { waLink, overdueReminderMessage, primaryContactPhone } from '@/utils/whatsapp'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { ShoppingBag, Truck, Factory, Users, ArrowUpRight, Package, Receipt, BarChart3, MessageCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { CREATE_STATE } from '@/hooks/useCreateOnArrival'
import { useTranslation } from 'react-i18next'
import { formatRp } from '@/components/ui'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, invoiceHooks, clientContactHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { format, differenceInCalendarDays } from 'date-fns'
import { isInMonth } from '@/utils/MonthUtils'
import { MonthsChart, MonthsLegend } from '@/components/finance/FinanceCharts'
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

type Tone = 'good' | 'bad' | 'neutral'
interface Delta { text: string; tone: Tone; title?: string }

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-green-700 dark:text-green-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-slate-500 dark:text-slate-400',
}
const TONE_TEXT_ON_NAVY: Record<Tone, string> = { good: 'text-green-300', bad: 'text-red-300', neutral: 'text-navy-200' }

/** The month a pointer is over, from its x across a chart of `n` months. */
function monthAt(e: React.PointerEvent<Element>, n: number) {
  const r = e.currentTarget.getBoundingClientRect()
  return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * n)))
}

/** Its width as it changes (for a chart that fills its card). */
function useBoxWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, width] as const
}

/** The last six months, small: bars for monthly totals (orders, spending),
 *  a filled line for a running balance (AR). Each month has its initial
 *  under it. Pointing at a month (hover; on a phone a tap, or a finger
 *  dragged across) picks it, and the card shows that month's figure where
 *  its comparison usually is (see MonthReadout), never under the finger.
 *  The last month is the current one, still running: its bar is striped and
 *  its point hollow, so an early-in-the-month dip doesn't read as a drop.
 *  `width="fill"` stretches it across its card (phones), so each month is a
 *  finger-sized target. */
function MiniTrend({ values, months, kind, label, format: fmt, accent = false, width = 132, height = 44, active, onActive }: {
  values: number[]
  months: Date[]
  kind: 'bars' | 'line'
  /** What the figures are, for the screen-reader summary. */
  label: string
  format: (n: number) => string
  accent?: boolean
  width?: number | 'fill'
  height?: number
  active: number | null
  onActive: (i: number | null) => void
}) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const patternId = useId()
  const [boxRef, boxWidth] = useBoxWidth<HTMLDivElement>()
  const pressed = useRef(false)
  if (values.length < 2) return null
  const w = width === 'fill' ? boxWidth : width
  const n = values.length
  const labelH = 12
  const plotH = height - labelH - 2
  const slot = w / n
  const max = Math.max(...values, 0) || 1
  const min = kind === 'line' ? Math.min(...values, 0) : 0
  const span = max - min || 1
  const y = (v: number) => 3 + (plotH - 3) - ((v - min) / span) * (plotH - 3)
  const cx = (i: number) => slot * i + slot / 2
  const last = n - 1
  const monthFmt = slot >= 20 ? 'MMM' : 'MMMMM'
  const muted = accent ? 'text-navy-300' : 'text-slate-400 dark:text-slate-500'
  const summary = t('dashboardKpi.trendAria', { label, values: values.map((v, i) => `${format(months[i], 'MMM', { locale: dateLocale })} ${fmt(v)}`).join(', ') })

  const linePts = values.map((v, i) => [cx(i), y(v)] as const)
  const linePath = linePts.map(([x, py], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${cx(last).toFixed(1)},${plotH} L${cx(0).toFixed(1)},${plotH} Z`

  return (
    <div ref={boxRef} className={width === 'fill' ? 'w-full' : 'shrink-0'} style={{ height }}>
      {w > 0 && (
        <svg
          width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={summary}
          // Focusable: the arrow keys step through the months.
          tabIndex={0}
          onFocus={() => { if (active == null) onActive(last) }}
          onBlur={() => onActive(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); onActive(Math.max(0, (active ?? last) - 1)) }
            else if (e.key === 'ArrowRight') { e.preventDefault(); onActive(Math.min(last, (active ?? last) + 1)) }
            else if (e.key === 'Escape') onActive(null)
          }}
          // A mouse picks by hovering; a finger by tapping (again to let go)
          // or dragging sideways. Up-and-down still scrolls the page.
          onPointerDown={e => {
            pressed.current = true
            const i = monthAt(e, n)
            onActive(e.pointerType !== 'mouse' && active === i ? null : i)
          }}
          onPointerMove={e => { if (e.pointerType === 'mouse' || pressed.current) onActive(monthAt(e, n)) }}
          onPointerUp={() => { pressed.current = false }}
          onPointerCancel={() => { pressed.current = false }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') onActive(null) }}
          style={{ touchAction: 'pan-y' }}
          className="overflow-visible block rounded outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current"
        >
          <defs>
            <linearGradient id={`${patternId}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
            <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="currentColor" opacity="0.25" />
              <rect width="1.6" height="4" fill="currentColor" />
            </pattern>
          </defs>
          {/* The picked month's column, faintly. */}
          {active != null && <rect x={slot * active + 1} y={0} width={Math.max(0, slot - 2)} height={plotH + 1} rx={4} fill="currentColor" opacity={0.08} />}
          {/* Baseline */}
          <line x1={0} x2={w} y1={plotH + 0.5} y2={plotH + 0.5} stroke="currentColor" strokeOpacity={0.18} />
          {kind === 'bars' ? values.map((v, i) => {
            const bw = Math.min(width === 'fill' ? 22 : 14, slot * 0.58)
            const top = y(v)
            const h = Math.max(v > 0 ? 2 : 0, plotH - top)
            const isActive = active === i
            return (
              <rect key={i} x={cx(i) - bw / 2} y={plotH - h} width={bw} height={h} rx={Math.min(2, bw / 2)}
                fill={i === last ? `url(#${patternId})` : 'currentColor'}
                opacity={isActive || active == null ? (i === last ? 1 : 0.85) : 0.35} />
            )
          }) : (
            <>
              <path d={areaPath} fill={`url(#${patternId}-fade)`} />
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
              {linePts.map(([x, py], i) => (
                <circle key={i} cx={x} cy={py} r={active === i ? 3.5 : i === last ? 3 : 1.75}
                  fill={i === last ? (accent ? '#131a32' : 'var(--chart-surface)') : 'currentColor'}
                  stroke="currentColor" strokeWidth={i === last ? 1.75 : 0} />
              ))}
            </>
          )}
          {months.map((m, i) => (
            <text key={i} x={cx(i)} y={height - 1} textAnchor="middle" fontSize={width === 'fill' ? 10 : 9} fill="currentColor"
              className={i === last || active === i ? '' : muted} fontWeight={i === last || active === i ? 600 : 400}>
              {format(m, monthFmt, { locale: dateLocale })}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}

/** A picked month's figure, in place of the card's comparison line. */
function useMonthReadout(months: Date[], values: number[], fmt: (n: number) => string) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const [active, setActive] = useState<number | null>(null)
  const last = months.length - 1
  const readout = active == null ? null : {
    month: `${format(months[active], 'MMMM yyyy', { locale: dateLocale })}${active === last ? ` (${t('dashboardKpi.soFar')})` : ''}`,
    value: fmt(values[active] ?? 0),
  }
  return { active, setActive, readout }
}

interface KpiProps {
  label: string
  value: string | number
  trend: number[]
  months: Date[]
  kind: 'bars' | 'line'
  format: (n: number) => string
  delta: Delta
  sub?: React.ReactNode
  accent?: boolean
}

// A label, the figure, its last six months and how it compares with last
// month, coloured by whether that's good news, not by its sign. Picking a
// month on the chart shows its figure where the comparison is.
function Kpi({ label, value, trend, months, kind, format: fmt, delta, sub, accent }: KpiProps) {
  const isMobile = useIsMobile()
  const { active, setActive, readout } = useMonthReadout(months, trend, fmt)
  const chart = (
    <span className={`${isMobile ? 'block w-full' : 'ml-auto'} ${accent ? 'text-gold-400' : 'text-navy-500 dark:text-navy-300'}`}>
      <MiniTrend values={trend} months={months} kind={kind} format={fmt} label={label} accent={accent}
        width={isMobile ? 'fill' : 132} height={isMobile ? 60 : 44} active={active} onActive={setActive} />
    </span>
  )
  return (
    <div className={`h-full rounded-2xl p-5 flex flex-col gap-3 min-w-0 ${
      accent ? 'bg-navy-900 text-white' : 'bg-white border border-slate-100 shadow-card dark:bg-navy-900 dark:border-navy-800'
    }`}>
      <span className={`text-sm font-medium ${accent ? 'text-navy-200' : 'text-slate-600 dark:text-slate-300'}`}>{label}</span>
      {/* The chart drops under the figure when both don't fit on one line,
          rather than squeezing the figure onto two; on a phone it's always
          under it, across the card. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 min-w-0">
        <p className={`font-mono font-semibold tabular-nums leading-tight tracking-tight text-2xl whitespace-nowrap ${accent ? 'text-white' : 'text-navy-900 dark:text-slate-50'}`}>
          {value}
        </p>
        {!isMobile && chart}
      </div>
      {isMobile && chart}
      <div className="mt-auto text-xs space-y-0.5 min-h-[2.25rem]" aria-live="polite">
        {readout ? (
          <>
            <p className={accent ? 'text-navy-200' : 'text-slate-500 dark:text-slate-400'}>{readout.month}</p>
            <p className={`font-mono font-semibold text-sm tabular-nums ${accent ? 'text-white' : 'text-navy-900 dark:text-slate-50'}`}>{readout.value}</p>
          </>
        ) : (
          <>
            <p className={`font-medium ${(accent ? TONE_TEXT_ON_NAVY : TONE_TEXT)[delta.tone]}`} title={delta.title}>{delta.text}</p>
            {sub && <p className={accent ? 'text-navy-200' : 'text-slate-500 dark:text-slate-400'}>{sub}</p>}
          </>
        )}
      </div>
    </div>
  )
}

// One of CostKpis' rows: its label, this month's spend and the six months.
function CostRow({ r }: { r: Omit<KpiProps, 'accent' | 'sub'> }) {
  const isMobile = useIsMobile()
  const { active, setActive, readout } = useMonthReadout(r.months, r.trend, r.format)
  const chart = (
    <MiniTrend values={r.trend} months={r.months} kind={r.kind} format={r.format} label={r.label}
      width={isMobile ? 'fill' : 66} height={isMobile ? 52 : 32} active={active} onActive={setActive} />
  )
  return (
    <div className="flex-1 px-4 py-3 min-w-0">
      {/* The chart sits beside the label so the amount keeps the full
          width (in this narrow card it pushed "Rp" onto its own line); on a
          phone it's under the amount, across the card. */}
      <div className="flex items-end justify-between gap-2 min-w-0">
        <span className={`text-sm font-medium text-slate-600 truncate dark:text-slate-300 ${isMobile ? '' : 'pb-3'}`}>{r.label}</span>
        {!isMobile && <span className="text-navy-500 dark:text-navy-300">{chart}</span>}
      </div>
      <p className="mt-0.5 font-mono font-semibold tabular-nums leading-tight text-lg text-navy-900 whitespace-nowrap dark:text-slate-50">{r.value}</p>
      {isMobile && <div className="mt-2 text-navy-500 dark:text-navy-300">{chart}</div>}
      <p className={`text-[11px] font-medium mt-0.5 min-h-[1rem] ${readout ? 'text-slate-600 dark:text-slate-300' : TONE_TEXT[r.delta.tone]}`}
        title={readout ? undefined : r.delta.title} aria-live="polite">
        {readout ? <>{readout.month}: <span className="font-mono font-semibold text-navy-900 dark:text-slate-50">{readout.value}</span></> : r.delta.text}
      </p>
    </div>
  )
}

// Production and Operations as one card: both are this month's spend.
function CostKpis({ rows }: { rows: Omit<KpiProps, 'accent' | 'sub'>[] }) {
  return (
    <div className="h-full rounded-2xl bg-white border border-slate-100 shadow-card min-w-0 flex flex-col divide-y divide-slate-100 dark:bg-navy-900 dark:border-navy-800 dark:divide-navy-800">
      {rows.map(r => <CostRow key={r.label} r={r} />)}
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

  // Recent Orders / AR Breakdown desktop rows are keyboard-activatable `<tr>`s
  // (a real <a>/<button> can't wrap a <tr> or its cells cleanly), so Enter/Space
  // need to trigger the same navigation a click does.
  const onRowActivate = (e: React.KeyboardEvent, go: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() }
  }

  // This month's costs against last month's, to the same day while it runs.
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const upToToday = (d: string) => Number(d.slice(8, 10)) <= now.getDate()
  const prodLastMonth = (safeProductions as ProductionRow[]).filter(p => isInMonth(p.date, lastMonth.getFullYear(), lastMonth.getMonth()) && upToToday(p.date)).reduce((s, p) => s + p.price * p.amount, 0)
  const opsLastMonth = (safeOperations as OperationRow[]).filter(o => isInMonth(o.date, lastMonth.getFullYear(), lastMonth.getMonth()) && upToToday(o.date)).reduce((s, o) => s + o.price, 0)
  const ordersThisMonth = (safeOrders as Order[]).filter(o => isInMonth(o.date, now.getFullYear(), now.getMonth())).length
  const deliveriesThisMonth = deliveries.filter(d => isInMonth(d.date, now.getFullYear(), now.getMonth())).length

  // ── KPI comparisons and six-month trends ──
  const lastMonthShort = format(lastMonth, 'MMM', { locale: dateLocale })
  const sameDaysTitle = t('dashboardKpi.sameDays', { month: format(lastMonth, 'MMMM', { locale: dateLocale }) })
  // Rising is good news for orders, bad news for costs: the colour follows that.
  const delta = (nowAmt: number, before: number, risingIs: 'good' | 'bad', text = 'dashboardKpi.vsMonth', title = sameDaysTitle): Delta => {
    if (!before) return { text: t('dashboardKpi.noComparison', { month: lastMonthShort }), tone: 'neutral', title }
    const d = Math.round(((nowAmt - before) / before) * 100)
    if (d === 0) return { text: t('dashboardKpi.unchanged', { month: lastMonthShort }), tone: 'neutral', title }
    const up = d > 0
    return { text: t(text, { arrow: up ? '▲' : '▼', change: changeLabel(Math.abs(d), up), month: lastMonthShort }), tone: up === (risingIs === 'good') ? 'good' : 'bad', title }
  }
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1))
  const perMonth = <T,>(rows: T[], date: (r: T) => string | null | undefined, value: (r: T) => number) =>
    months.map(m => rows.filter(r => isInMonth(date(r), m.getFullYear(), m.getMonth())).reduce((n, r) => n + value(r), 0))
  const inLastMonthSoFar = (d: string) => isInMonth(d, lastMonth.getFullYear(), lastMonth.getMonth()) && upToToday(d)
  const ordersLastMonth = (safeOrders as Order[]).filter(o => inLastMonthSoFar(o.date)).length
  const deliveriesLastMonth = deliveries.filter(d => inLastMonthSoFar(d.date)).length

  // What was owed at the end of a day: invoices issued by then and not yet
  // paid by then (a paid invoice with no paid date counts as paid all along).
  const arAt = (end: Date) => {
    const day = format(end, 'yyyy-MM-dd')
    return (safeInvoices as Invoice[])
      .filter(i => i.tanggal.slice(0, 10) <= day && !(i.status === 'paid' && (!i.paid_date || i.paid_date.slice(0, 10) <= day)))
      .reduce((n, i) => n + invoiceAmountDue(i), 0)
  }
  const arEndOfLastMonth = arAt(new Date(now.getFullYear(), now.getMonth(), 0))
  const arTrend = months.map((m, i) => (i === months.length - 1 ? totalAR : arAt(new Date(m.getFullYear(), m.getMonth() + 1, 0))))
  const overdueAmount = overdueInvoices.reduce((n, i) => n + invoiceAmountDue(i), 0)

  // The last six months for the chart: invoiced (paid / unpaid) beside
  // spent (production / operations), on the same rules as the KPIs above.
  const monthsMoney = months.map(m => {
    const y = m.getFullYear(), mo = m.getMonth()
    const inv = (safeInvoices as Invoice[]).filter(i => isInMonth(i.tanggal, y, mo))
    return {
      label: format(m, 'MMM', { locale: dateLocale }),
      name: format(m, 'MMMM yyyy', { locale: dateLocale }),
      paid: inv.filter(i => i.status === 'paid').reduce((n, i) => n + invoiceAmountDue(i), 0),
      unpaid: inv.filter(i => i.status !== 'paid').reduce((n, i) => n + invoiceAmountDue(i), 0),
      production: (safeProductions as ProductionRow[]).filter(p => isInMonth(p.date, y, mo)).reduce((n, p) => n + p.price * p.amount, 0),
      operations: (safeOperations as OperationRow[]).filter(o => isInMonth(o.date, y, mo)).reduce((n, o) => n + o.price, 0),
    }
  })

  // When an invoice is due, and how late it is once it's overdue.
  const dueText = (inv: Invoice, stacked = false) => {
    const date = inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy', { locale: dateLocale }) : '—'
    if (!isOverdue(inv.due_date)) return <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{date}</span>
    const late = t('dashboard.overdueBy', { count: daysOverdue(inv.due_date!, now) })
    return stacked
      ? <span className="block whitespace-nowrap"><span className="block text-slate-500 dark:text-slate-400">{date}</span><span className="block font-semibold text-red-600 dark:text-red-400">{late}</span></span>
      : <span className="whitespace-nowrap font-semibold text-red-600 dark:text-red-400">{late}</span>
  }
  // A WhatsApp reminder, for an overdue invoice whose client has a phone number.
  const reminderFor = (inv: Invoice) => {
    if (!isOverdue(inv.due_date)) return null
    const clientId = safeOrders.find(o => o.id === inv.order_id)?.client_id ?? null
    const wa = waLink(primaryContactPhone(clientId, contacts), overdueReminderMessage({
      clientName: inv.kepada_yth, invoiceId: inv.id, orderId: inv.order_id,
      daysLate: daysOverdue(inv.due_date!, now), amount: invoiceAmountDue(inv),
    }))
    if (!wa) return null
    // 44px tap target around a small icon: it opens a message to a client
    // about money they owe, so a mis-tap matters.
    return (
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        title={t('dashboard.remindOnWhatsapp')}
        aria-label={t('dashboard.remindOnWhatsapp')}
        className="inline-flex w-11 h-11 -my-2 rounded-lg items-center justify-center text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 transition-colors shrink-0"
      >
        <MessageCircle className="w-4 h-4" />
      </a>
    )
  }

  if (isLoading) return <LoadingState label={t('dashboard.loading')} />
  if (isError) return <div className="p-4 md:p-6"><div className="card"><ErrorState what={t('dashboard.errorWhat')} onRetry={retryAll} /></div></div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">

      {/* ── KPI row ─────────────────────────────────────────── */}
      {/* One card per row on a phone, so each chart has the full width. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Receivables spans two columns and carries the accent */}
        <div className="sm:col-span-2 h-full">
          <Kpi
            accent
            label={t('dashboard.arReceivable')}
            value={formatRp(totalAR)}
            trend={arTrend}
            months={months}
            kind="line"
            format={formatRp}
            delta={delta(totalAR, arEndOfLastMonth, 'bad', 'dashboardKpi.arVsEnd', t('dashboardKpi.arVsEndTitle', { month: format(lastMonth, 'MMMM', { locale: dateLocale }) }))}
            sub={<>
              {t('dashboardKpi.unpaidInvoices', { count: unpaidInvoices.length })}
              {' · '}
              {overdueAmount > 0
                ? <span className="font-medium text-red-300">{t('dashboardKpi.overdueAmount', { amount: formatRp(overdueAmount) })}</span>
                : t('dashboardKpi.noneOverdue')}
            </>}
          />
        </div>
        <Kpi
          label={t('dashboard.ordersThisMonth')}
          value={ordersThisMonth}
          trend={perMonth(safeOrders as Order[], o => o.date, () => 1)}
          months={months}
          kind="bars"
          format={String}
          delta={delta(ordersThisMonth, ordersLastMonth, 'good')}
          sub={t('common.inAllCount', { count: orders.length })}
        />
        <Kpi
          label={t('dashboard.deliveriesThisMonth')}
          value={deliveriesThisMonth}
          trend={perMonth(deliveries, d => d.date, () => 1)}
          months={months}
          kind="bars"
          format={String}
          delta={delta(deliveriesThisMonth, deliveriesLastMonth, 'good')}
          sub={t('common.inAllCount', { count: deliveries.length })}
        />
        {/* Two columns wide below xl, so it never sits alone beside an empty slot. */}
        <div className="sm:col-span-2 xl:col-span-1 h-full">
          <CostKpis rows={[
            { label: t('common.production'), value: formatRp(prodCostThisMonth), trend: perMonth(safeProductions as ProductionRow[], p => p.date, p => p.price * p.amount), months, kind: 'bars', format: formatRp, delta: delta(prodCostThisMonth, prodLastMonth, 'bad') },
            { label: t('common.operations'), value: formatRp(opsCostThisMonth), trend: perMonth(safeOperations as OperationRow[], o => o.date, o => o.price), months, kind: 'bars', format: formatRp, delta: delta(opsCostThisMonth, opsLastMonth, 'bad') },
          ]} />
        </div>
      </div>

      {/* ── Below the KPIs: what's owed and the latest orders on the wide
           left, this month's picture and shortcuts on the right. On a phone
           the money owed comes first, straight after the KPIs. ───────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:items-start">
        <div className="xl:col-span-2 flex flex-col gap-4 min-w-0">

          {/* Unpaid invoices, overdue first (oldest due date first). One list
              instead of an "overdue" card and a separate breakdown that
              repeated the same invoices. */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-1 dark:bg-navy-900 dark:border-navy-800">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 dark:border-navy-800">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-navy-400 shrink-0" />
                <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('dashboard.unpaidTitle')}</h3>
                {overdueInvoices.length > 0 && (
                  <span className="badge bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">{t('dashboard.overdueCount', { count: overdueInvoices.length })}</span>
                )}
              </div>
              <Link to="/invoice" className="tap flex items-center gap-1 -my-2 py-2 text-xs text-navy-600 hover:text-navy-800 dark:text-navy-300 dark:hover:text-slate-100 transition-colors font-medium shrink-0">
                {t('common.viewAll')} <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {arBreakdown.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-slate-300 dark:text-navy-700">
                <Receipt className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noOutstandingReceivables')}</p>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{t('dashboard.everythingPaidUp')}</p>
              </div>
            ) : isMobile ? (
              <div className="divide-y divide-slate-100 dark:divide-navy-800">
                {arBreakdown.slice(0, 6).map(inv => {
                  const reminder = reminderFor(inv)
                  return (
                    <div key={inv.id} className="flex items-center gap-1 pr-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}
                        className="flex-1 min-w-0 flex flex-col gap-1 pl-5 pr-2 py-3 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-navy-900 text-sm truncate dark:text-slate-50">{inv.kepada_yth}</span>
                          <span className="currency font-semibold text-sm shrink-0">{formatRp(invoiceAmountDue(inv))}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-slate-500 truncate dark:text-slate-400">{inv.id}</span>
                          {dueText(inv)}
                        </span>
                      </button>
                      {reminder}
                    </div>
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
                      <th className="text-right">{t('dashboard.amountDue')}</th>
                      <th>{t('common.dueDate')}</th>
                      <th><span className="sr-only">{t('dashboard.remindOnWhatsapp')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {arBreakdown.slice(0, 6).map(inv => (
                      // The row is clickable for the mouse; the invoice number
                      // is the keyboard's way in, so the WhatsApp link beside
                      // it isn't nested inside another control.
                      <tr key={inv.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => navigate(`/invoice/${encodeURIComponent(inv.id)}`)}>
                        <td>
                          <Link to={`/invoice/${encodeURIComponent(inv.id)}`} onClick={e => e.stopPropagation()} className="id-chip font-mono hover:ring-1 hover:ring-navy-300">{inv.id}</Link>
                        </td>
                        <td className="font-medium text-navy-900 dark:text-slate-50">{inv.kepada_yth}</td>
                        <td>
                          <span className={`badge ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                            {inv.type === 'dp' ? t('common.downPayment') : 'Pelunasan'}
                          </span>
                        </td>
                        <td className="currency font-semibold text-right whitespace-nowrap">{formatRp(invoiceAmountDue(inv))}</td>
                        <td className="text-xs">{dueText(inv, true)}</td>
                        <td className="w-12 text-right" onClick={e => e.stopPropagation()}>{reminderFor(inv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {arBreakdown.length > 6 && (
              <Link to="/invoice" className="block px-5 py-2.5 text-xs text-slate-500 hover:text-navy-700 border-t border-slate-100 dark:border-navy-800 dark:text-slate-400 dark:hover:text-slate-200">
                {t('common.moreCount', { count: arBreakdown.length - 6 })}
              </Link>
            )}
          </section>

          {/* Recent orders */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden fade-up delay-2 dark:bg-navy-900 dark:border-navy-800">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between dark:border-navy-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-navy-400" />
                <h3 className="font-semibold text-navy-900 text-sm dark:text-slate-50">{t('dashboard.recentOrders')}</h3>
              </div>
              <Link to="/orders" className="tap flex items-center gap-1 -my-2 py-2 text-xs text-navy-600 hover:text-navy-800 dark:text-navy-300 dark:hover:text-slate-100 transition-colors font-medium">
                {t('common.viewAll')} <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-slate-300 dark:text-navy-700">
                <Package className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noOrdersYet')}</p>
                <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{t('dashboard.ordersWillAppearHere')}</p>
              </div>
            ) : isMobile ? (
              <div className="divide-y divide-slate-100 dark:divide-navy-800">
                {recentOrders.map((o) => {
                  const status = orderInvoiceStatus(o.id)
                  return (
                    <button
                      key={o.id}
                      onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                      className="w-full flex flex-col gap-1 px-5 py-3 text-left hover:bg-slate-50 transition-colors dark:hover:bg-white/5"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-navy-900 text-sm truncate dark:text-slate-50">{o.company ?? '—'}</span>
                        <span className={`badge shrink-0 ${status.className}`}>{status.label}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono truncate">{o.id}{o.po_number ? ` · ${o.po_number}` : ''}</span>
                        <span className="whitespace-nowrap shrink-0">{o.date ? format(new Date(o.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}</span>
                      </span>
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
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:ring-inset"
                          onClick={() => navigate(`/orders/${encodeURIComponent(o.id)}`)}
                          onKeyDown={(e) => onRowActivate(e, () => navigate(`/orders/${encodeURIComponent(o.id)}`))}
                        >
                          <td><span className="id-chip">{o.id}</span></td>
                          <td className="font-medium text-navy-900 dark:text-slate-50">{o.company ?? '—'}</td>
                          <td className="font-mono text-xs text-slate-500 dark:text-slate-400">{o.po_number ?? '—'}</td>
                          <td className="text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                            {o.date ? format(new Date(o.date), 'dd MMM yyyy', { locale: dateLocale }) : '—'}
                          </td>
                          <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right column: this month in one chart, then shortcuts */}
        <div className="flex flex-col gap-4">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-1 dark:bg-navy-900 dark:border-navy-800">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-navy-400 shrink-0" />
              <h3 className="font-semibold text-navy-900 text-sm truncate dark:text-slate-50">{t('dashboardChart.title')}</h3>
              <Link to="/finance" className="tap ml-auto flex items-center gap-1 -my-2 py-2 text-xs text-navy-600 hover:text-navy-800 dark:text-navy-300 dark:hover:text-slate-100 transition-colors font-medium shrink-0">
                {t('dashboard.yearly')} <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">
              {t('dashboardChart.thisMonth', { month: format(now, 'MMMM', { locale: dateLocale }) })}{' '}
              <span className={`font-semibold tabular-nums ${profitThisMonth >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {profitThisMonth >= 0 ? t('common.profit') : t('common.loss')} {formatRp(Math.abs(profitThisMonth))}
              </span>
            </p>
            <MonthsChart data={monthsMoney} />
            <div className="mt-3"><MonthsLegend /></div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t(isMobile ? 'dashboardChart.hintTouch' : 'dashboardChart.hint')}</p>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 fade-up delay-2 dark:bg-navy-900 dark:border-navy-800">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 dark:text-slate-400">{t('dashboard.quickActions')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
              {[
                // Finance isn't listed: it's already a direct Sidebar entry.
                { label: t('dashboard.newOrder'),      href: '/orders',     icon: ShoppingBag },
                { label: t('dashboard.newDelivery'),   href: '/delivery',   icon: Truck },
                { label: t('dashboard.addProduction'), href: '/production', icon: Factory },
                { label: t('dashboard.addSupplier'),  href: '/suppliers',  icon: Users },
              ].map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  to={href}
                  state={CREATE_STATE}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-600 dark:text-slate-300
                             hover:bg-navy-900 hover:text-white transition-all duration-150 group"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-gold-400 transition-colors" />
                  <span className="truncate">{label}</span>
                  <ArrowUpRight className="w-3 h-3 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

    </div>
  )
}
