import type { Client, Invoice, Item, Order } from '@/types'
import { invoiceAmount } from '@/utils/invoiceAmount'
import { inPeriod, type LedgerRow, type Period } from './ledgerModel'

// The numbers on the Finance page. Money earned is what's invoiced (see
// invoiceAmount), counted in the
// month it's dated; money spent is every Kas Bon line, on its Kas Bon's date.
// Cash in is an invoice once paid, on the day it was paid.

export { invoiceAmount }

const day = (s: string | null | undefined) => (s ?? '').slice(0, 10)
export const paidOn = (inv: Invoice) => day(inv.paid_date) || day(inv.tanggal)
export const dueOn = (inv: Invoice) => day(inv.due_date) || day(inv.tanggal)
export const isPaid = (inv: Invoice) => inv.status === 'paid'

export interface MonthStat {
  month: number
  invoiced: number
  production: number
  operation: number
  cost: number
  profit: number
  cashIn: number
}

export function monthly(year: number, invoices: Invoice[], costs: LedgerRow[]): MonthStat[] {
  const rows: MonthStat[] = Array.from({ length: 12 }, (_, month) => ({ month, invoiced: 0, production: 0, operation: 0, cost: 0, profit: 0, cashIn: 0 }))
  const monthOf = (d: string) => (d.slice(0, 4) === String(year) ? Number(d.slice(5, 7)) - 1 : -1)
  for (const inv of invoices) {
    const m = monthOf(day(inv.tanggal))
    if (m >= 0) rows[m].invoiced += invoiceAmount(inv)
    const p = isPaid(inv) ? monthOf(paidOn(inv)) : -1
    if (p >= 0) rows[p].cashIn += invoiceAmount(inv)
  }
  for (const c of costs) {
    const m = monthOf(day(c.date))
    if (m < 0) continue
    rows[m][c.kind] += c.total
  }
  for (const r of rows) {
    r.cost = r.production + r.operation
    r.profit = r.invoiced - r.cost
  }
  return rows
}

export interface Totals { invoiced: number; cost: number; production: number; operation: number; cashIn: number; profit: number }

export function totals(period: Period, invoices: Invoice[], costs: LedgerRow[]): Totals {
  const t: Totals = { invoiced: 0, cost: 0, production: 0, operation: 0, cashIn: 0, profit: 0 }
  for (const inv of invoices) {
    if (inPeriod(day(inv.tanggal), period)) t.invoiced += invoiceAmount(inv)
    if (isPaid(inv) && inPeriod(paidOn(inv), period)) t.cashIn += invoiceAmount(inv)
  }
  for (const c of costs) if (inPeriod(c.date, period)) t[c.kind] += c.total
  t.cost = t.production + t.operation
  t.profit = t.invoiced - t.cost
  return t
}

// ── Cash in and out, week by week or month by month ─────────────────────────

export interface FlowBucket { key: string; label: string; start: string; cashIn: number; cashOut: number }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Buckets covering the period: weeks (from Monday) for a month or a short
 *  range, months otherwise. */
export function cashFlow(period: Period, invoices: Invoice[], costs: LedgerRow[], allDates: string[]): FlowBucket[] {
  let from: Date, to: Date
  if (period.mode === 'month') { from = new Date(period.year, period.month, 1); to = new Date(period.year, period.month + 1, 0) }
  else if (period.mode === 'year') { from = new Date(period.year, 0, 1); to = new Date(period.year, 11, 31) }
  else {
    const sorted = allDates.filter(Boolean).sort()
    from = new Date((period.mode === 'range' && period.from) || sorted[0] || iso(new Date()))
    to = new Date((period.mode === 'range' && period.to) || sorted[sorted.length - 1] || iso(new Date()))
  }
  const weekly = (to.getTime() - from.getTime()) / 86400000 <= 93
  const buckets: FlowBucket[] = []
  if (weekly) {
    const d = new Date(from)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
    while (d <= to) {
      buckets.push({ key: iso(d), start: iso(d), label: `${d.getDate()}/${d.getMonth() + 1}`, cashIn: 0, cashOut: 0 })
      d.setDate(d.getDate() + 7)
    }
  } else {
    const d = new Date(from.getFullYear(), from.getMonth(), 1)
    while (d <= to) {
      buckets.push({ key: iso(d), start: iso(d), label: d.toLocaleDateString('en-US', { month: 'short' }) + (from.getFullYear() !== to.getFullYear() ? ` ${String(d.getFullYear()).slice(2)}` : ''), cashIn: 0, cashOut: 0 })
      d.setMonth(d.getMonth() + 1)
    }
  }
  const find = (date: string) => {
    if (!date || !inPeriod(date, period)) return null
    let hit: FlowBucket | null = null
    for (const b of buckets) if (b.start <= date) hit = b
    return hit
  }
  for (const inv of invoices) if (isPaid(inv)) { const b = find(paidOn(inv)); if (b) b.cashIn += invoiceAmount(inv) }
  for (const c of costs) { const b = find(day(c.date)); if (b) b.cashOut += c.total }
  return buckets
}

// ── Receivables ──────────────────────────────────────────────────────────────

export const AGING = [
  { key: 'current', label: 'Not due yet', max: 0, color: '#94a3b8' },
  { key: '1-30', label: '1–30 days late', max: 30, color: '#fbbf24' },
  { key: '31-60', label: '31–60 days', max: 60, color: '#f97316' },
  { key: '61-90', label: '61–90 days', max: 90, color: '#ef4444' },
  { key: '90+', label: 'Over 90 days', max: Infinity, color: '#991b1b' },
] as const

export interface Receivable { invoice: Invoice; amount: number; daysLate: number; bucket: typeof AGING[number]['key']; client: string }

export function receivables(invoices: Invoice[], orders: Order[], clients: Client[], today = new Date()): Receivable[] {
  const now = iso(today)
  return invoices.filter(i => !isPaid(i) && invoiceAmount(i) > 0).map(invoice => {
    const due = dueOn(invoice)
    const daysLate = due && due < now ? Math.round((new Date(now).getTime() - new Date(due).getTime()) / 86400000) : 0
    const bucket = AGING.find(b => daysLate <= b.max)!.key
    return { invoice, amount: invoiceAmount(invoice), daysLate, bucket, client: clientOfInvoice(invoice, orders, clients) }
  }).sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount)
}

export function clientOfInvoice(inv: Invoice, orders: Order[], clients: Client[]): string {
  const order = orders.find(o => o.id === inv.order_id)
  const client = order?.client_id != null ? clients.find(c => c.id === order.client_id) : undefined
  return client?.client_name ?? order?.company ?? inv.kepada_yth ?? 'Unknown'
}

// ── Orders and clients ───────────────────────────────────────────────────────

export interface OrderStat {
  order: Order
  client: string
  clientId: number | null
  value: number      // what the order's items are worth
  invoiced: number
  paid: number
  costs: number      // Kas Bon lines linked to it
  profit: number     // value - costs
}

export function orderStats(orders: Order[], items: Item[], invoices: Invoice[], costs: LedgerRow[], clients: Client[]): Map<string, OrderStat> {
  const out = new Map<string, OrderStat>()
  for (const o of orders) {
    const client = o.client_id != null ? clients.find(c => c.id === o.client_id) : undefined
    out.set(o.id, { order: o, client: client?.client_name ?? o.company ?? 'No client', clientId: o.client_id ?? null, value: 0, invoiced: 0, paid: 0, costs: 0, profit: 0 })
  }
  for (const it of items) { const s = out.get(it.order_id); if (s) s.value += it.sub_total }
  for (const inv of invoices) {
    const s = out.get(inv.order_id)
    if (!s) continue
    s.invoiced += invoiceAmount(inv)
    if (isPaid(inv)) s.paid += invoiceAmount(inv)
  }
  for (const c of costs) { if (c.order_id) { const s = out.get(c.order_id); if (s) s.costs += c.total } }
  for (const s of out.values()) s.profit = s.value - s.costs
  return out
}

export interface ClientStat { key: string; clientId: number | null; name: string; orders: number; value: number; invoiced: number; costs: number; profit: number; outstanding: number }

export function clientStats(stats: OrderStat[], open: Receivable[], orders: Order[]): ClientStat[] {
  const by = new Map<string, ClientStat>()
  const get = (key: string, name: string, clientId: number | null) => {
    if (!by.has(key)) by.set(key, { key, clientId, name, orders: 0, value: 0, invoiced: 0, costs: 0, profit: 0, outstanding: 0 })
    return by.get(key)!
  }
  for (const s of stats) {
    const c = get(s.clientId != null ? `c${s.clientId}` : `n${s.client}`, s.client, s.clientId)
    c.orders += 1
    c.value += s.value
    c.invoiced += s.invoiced
    c.costs += s.costs
    c.profit += s.profit
  }
  for (const r of open) {
    const order = orders.find(o => o.id === r.invoice.order_id)
    const c = get(order?.client_id != null ? `c${order.client_id}` : `n${r.client}`, r.client, order?.client_id ?? null)
    c.outstanding += r.amount
  }
  return [...by.values()].sort((a, b) => b.value - a.value)
}
