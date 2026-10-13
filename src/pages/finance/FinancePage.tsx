import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, BarChart3, CheckCircle2, ChevronRight, Download, Hourglass, PiggyBank, Receipt, Repeat, Scale, TrendingUp, Unlink, Wallet } from 'lucide-react'
import { formatRp } from '@/components/ui'
import { PageHeader, Card, LoadingState, ErrorState } from '@/components/ui/Page'
import {
  orderHooks, itemHooks, invoiceHooks, clientHooks, supplierHooks, productionHooks, operationHooks, buktiKasHooks, useBudgets, useRecurringCosts,
} from '@/hooks'
import { monthLabel, shortMonthLabel } from '@/utils/MonthUtils'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import type { Invoice } from '@/types'
import { fromProduction, fromOperation, inPeriod, orderLabel, type Period } from '@/components/finance/ledgerModel'
import { PeriodPicker, periodLabel, periodSlug, currentPeriod } from '@/components/finance/PeriodPicker'
import { periodParam, sheetParams } from '@/components/finance/ledgerParams'
import {
  monthly, totals, cashFlow, receivables, orderStats, clientStats, invoiceAmount, dueOn, AGING, budgetUsage, monthKey,
} from '@/components/finance/financeStats'
import { TrendChart, TREND_LEGEND, CashFlowChart, CASH_LEGEND, Legend, RankBars, SplitBar, shortRp } from '@/components/finance/FinanceCharts'
import { ledgerSheet, exportLedger } from '@/components/finance/ledgerExport'
import type { SheetSpec } from '@/utils/xlsx'

type Breakdown = 'supplier' | 'material' | 'category'

function Kpi({ label, value, sub, icon: Icon, tone = 'default' }: {
  label: string; value: string; sub?: React.ReactNode; icon: React.ElementType; tone?: 'default' | 'good' | 'bad'
}) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-navy-900'
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon size={14} className="text-slate-400" />{label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold font-mono tabular-nums truncate ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 truncate">{sub}</div>}
    </div>
  )
}

function Attention({ icon: Icon, tone, children, action, onAction }: {
  icon: React.ElementType; tone: 'bad' | 'warn' | 'info'; children: React.ReactNode; action: string; onAction: () => void
}) {
  const color = tone === 'bad' ? 'text-red-600 bg-red-50' : tone === 'warn' ? 'text-amber-600 bg-amber-50' : 'text-navy-600 bg-navy-50'
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}><Icon size={16} /></span>
      <span className="flex-1 min-w-0 text-sm text-slate-700">{children}</span>
      <button className="btn-ghost btn-sm shrink-0" onClick={onAction}>{action} <ChevronRight size={14} /></button>
    </li>
  )
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
const delta = (now: number, before: number) => {
  if (!before) return null
  const d = Math.round(((now - before) / Math.abs(before)) * 100)
  return `${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d)}% vs last year`
}

/** Money in and out across the business: the year month by month, where it
 *  goes, who owes what, and how each client and order did. */
export function FinancePage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>(() => currentPeriod('year'))
  const [breakdown, setBreakdown] = useState<Breakdown>('supplier')

  const ordersQ = orderHooks.useList()
  const itemsQ = itemHooks.useList()
  const invoicesQ = invoiceHooks.useList()
  const clientsQ = clientHooks.useList()
  const suppliersQ = supplierHooks.useList()
  const productionQ = productionHooks.useList()
  const operationQ = operationHooks.useList()
  const buktiKasQ = buktiKasHooks.useList()
  const queries = [ordersQ, itemsQ, invoicesQ, clientsQ, suppliersQ, productionQ, operationQ, buktiKasQ]
  const { data: budgets = [] } = useBudgets()
  const { data: recurring = [] } = useRecurringCosts()

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const invoices = useMemo(() => (invoicesQ.data ?? []) as Invoice[], [invoicesQ.data])
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data])
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data])
  const costs = useMemo(() => [...productionQ.data.map(fromProduction), ...operationQ.data.map(fromOperation)], [productionQ.data, operationQ.data])
  const buktiKas = useMemo(() => buktiKasQ.data ?? [], [buktiKasQ.data])

  const year = period.mode === 'month' || period.mode === 'year' ? period.year : new Date().getFullYear()
  const months = useMemo(() => monthly(year, invoices, costs, buktiKas), [year, invoices, costs, buktiKas])
  const lastYear = useMemo(() => monthly(year - 1, invoices, costs, buktiKas), [year, invoices, costs, buktiKas])
  const t = useMemo(() => totals(period, invoices, costs, buktiKas), [period, invoices, costs, buktiKas])
  const prevT = useMemo(() => (period.mode === 'year' || period.mode === 'month' ? totals({ ...period, year: period.year - 1 }, invoices, costs, buktiKas) : null), [period, invoices, costs, buktiKas])
  const flow = useMemo(() => cashFlow(period, invoices, costs, [...costs.map(c => c.date.slice(0, 10)), ...invoices.map(i => i.tanggal.slice(0, 10)), ...buktiKas.map(b => b.date.slice(0, 10))], buktiKas), [period, invoices, costs, buktiKas])
  const open = useMemo(() => receivables(invoices, orders, clients), [invoices, orders, clients])
  const inPeriodOrders = useMemo(() => orders.filter(o => inPeriod(o.date, period)), [orders, period])
  const stats = useMemo(() => orderStats(orders, items, invoices, costs, clients), [orders, items, invoices, costs, clients])
  const periodStats = useMemo(() => inPeriodOrders.map(o => stats.get(o.id)!).filter(Boolean).sort((a, b) => b.value - a.value), [inPeriodOrders, stats])
  const byClient = useMemo(() => clientStats(periodStats, open, orders), [periodStats, open, orders])
  const periodCosts = useMemo(() => costs.filter(c => inPeriod(c.date, period)), [costs, period])
  const periodBuktiKas = useMemo(() => buktiKas.filter(b => inPeriod(b.date, period)), [buktiKas, period])
  const unlinked = periodCosts.filter(c => c.kind === 'production' && !c.order_id).reduce((n, c) => n + c.total, 0)

  const where = useMemo(() => {
    const sum = new Map<string, { label: string; value: number; color?: string; sub?: string }>()
    const add = (id: string, label: string, v: number, color?: string, sub?: string) => {
      const cur = sum.get(id) ?? { label, value: 0, color, sub }
      cur.value += v
      sum.set(id, cur)
    }
    for (const c of periodCosts) {
      if (breakdown === 'category' && c.kind === 'operation') add(c.category, c.category || 'Uncategorized', c.total)
      if (c.kind !== 'production') continue
      if (breakdown === 'supplier') {
        const s = suppliers.find(x => x.id === c.supplier_id)
        add(String(c.supplier_id), s?.supplier_name ?? 'No supplier', c.total, s ? CATEGORY_COLORS[s.supplier_category] : undefined)
      } else if (breakdown === 'material') {
        add(c.name, c.name, c.total)
      }
    }
    return [...sum.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value).slice(0, 12)
  }, [periodCosts, breakdown, suppliers])

  const aging = AGING.map(b => ({ key: b.key, label: b.label, color: b.color, value: open.filter(r => r.bucket === b.key).reduce((n, r) => n + r.amount, 0) }))
  const owed = open.reduce((n, r) => n + r.amount, 0)
  const overdue = open.filter(r => r.daysLate > 0).reduce((n, r) => n + r.amount, 0)

  // What needs doing now: always about the current month, whatever period is shown.
  const now = new Date()
  const thisMonth = monthKey(now.getFullYear(), now.getMonth())
  const late = open.filter(r => r.daysLate > 0)
  const tight = budgetUsage(budgets, costs, thisMonth).filter(u => u.share >= 0.8)
  const recurringDue = recurring.filter(c => c.active && (!c.last_posted || c.last_posted < thisMonth))
  const unlinkedNow = costs.filter(c => c.kind === 'production' && !c.order_id && c.date.slice(0, 7) === thisMonth).reduce((n, c) => n + c.total, 0)
  const selectedMonth = period.mode === 'month' && period.year === year ? period.month : null

  const openSheet = (kind: 'production' | 'operations', f: { group?: string; q?: string }) => {
    const p = period.mode === 'range' ? 'all' : periodParam(period)
    navigate(`/${kind}?${new URLSearchParams(sheetParams({ ...f, period: p })).toString()}`)
  }

  const download = () => {
    const sheets: SheetSpec[] = [
      {
        name: `Summary ${year}`,
        columns: [{ header: 'Month' }, { header: 'Invoiced', kind: 'money' }, { header: 'Production', kind: 'money' }, { header: 'Operations', kind: 'money' }, { header: 'Spent', kind: 'money' }, { header: 'Profit', kind: 'money' }, { header: 'Paid in', kind: 'money' }],
        rows: months.map(m => [`${shortMonthLabel(m.month)} ${year}`, m.invoiced, m.production, m.operation, m.cost, m.profit, m.cashIn]),
        totals: { 0: 'Total', 1: months.reduce((n, m) => n + m.invoiced, 0), 2: months.reduce((n, m) => n + m.production, 0), 3: months.reduce((n, m) => n + m.operation, 0), 4: months.reduce((n, m) => n + m.cost, 0), 5: months.reduce((n, m) => n + m.profit, 0), 6: months.reduce((n, m) => n + m.cashIn, 0) },
      },
      ledgerSheet('Production', periodCosts.filter(c => c.kind === 'production'), suppliers, orders),
      ledgerSheet('Operations', periodCosts.filter(c => c.kind === 'operation'), suppliers, orders),
      {
        name: 'Bukti Kas',
        columns: [
          { header: 'Bukti Kas' }, { header: 'Date', kind: 'date', width: 12 }, { header: 'Description' },
          { header: 'Received for' }, { header: 'Amount', kind: 'money', width: 15 }, { header: 'Order' },
        ],
        rows: periodBuktiKas.map(b => [b.header_id, b.date.slice(0, 10), b.description, b.item_description, b.price, orderLabel(orders, b.order_id)]),
        totals: { 0: 'Total', 4: periodBuktiKas.reduce((n, b) => n + b.price, 0) },
      },
      {
        name: 'Clients',
        columns: [{ header: 'Client' }, { header: 'Orders', kind: 'number' }, { header: 'Order value', kind: 'money' }, { header: 'Invoiced', kind: 'money' }, { header: 'Linked costs', kind: 'money' }, { header: 'Profit', kind: 'money' }, { header: 'Owed now', kind: 'money' }],
        rows: byClient.map(c => [c.name, c.orders, c.value, c.invoiced, c.costs, c.profit, c.outstanding]),
      },
      {
        name: 'Receivables',
        columns: [{ header: 'Invoice' }, { header: 'Order' }, { header: 'Client' }, { header: 'Type' }, { header: 'Due', kind: 'date' }, { header: 'Days late', kind: 'number' }, { header: 'Amount', kind: 'money' }],
        rows: open.map(r => [r.invoice.id, r.invoice.order_id, r.client, r.invoice.type, dueOn(r.invoice), r.daysLate, r.amount]),
        totals: { 0: 'Total', 6: owed },
      },
    ]
    exportLedger(`Finance ${periodSlug(period)}`, sheets)
  }

  if (queries.some(q => q.isLoading)) return <LoadingState label="Loading the finance numbers…" />
  if (queries.some(q => q.isError)) {
    return <div className="p-4 md:p-6"><div className="card"><ErrorState what="all the finance data" onRetry={() => queries.forEach(q => q.refetch())} /></div></div>
  }

  const margin = t.invoiced ? t.profit / t.invoiced : 0
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <PageHeader
        icon={BarChart3}
        title="Overview"
        subtitle={`${periodLabel(period)} · invoiced against Kas Bon spending`}
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <button className="btn-secondary btn-sm" onClick={download} title="Summary, lines, clients and receivables as one Excel file"><Download size={14} /> Excel</button>
          </>
        }
      />

      <Card title={`Needs attention · ${monthLabel(now.getFullYear(), now.getMonth())}`} icon={AlertCircle} bodyClassName="px-5 pb-2">
        {late.length || tight.length || recurringDue.length || unlinkedNow > 0 ? (
          <ul className="divide-y divide-slate-100">
            {late.length > 0 && (
              <Attention icon={Hourglass} tone="bad" action="See who" onAction={() => document.getElementById('owed')?.scrollIntoView({ behavior: 'smooth' })}>
                <b>{late.length} invoice{late.length === 1 ? '' : 's'} overdue</b>, {formatRp(late.reduce((n, r) => n + r.amount, 0))}; the oldest {late[0].daysLate} days late ({late[0].client}).
              </Attention>
            )}
            {tight.map(u => (
              <Attention key={u.budget.id} icon={Scale} tone={u.share > 1 ? 'bad' : 'warn'} action="Budgets" onAction={() => navigate('/finance/budgets')}>
                <b>{u.label}</b> is at {Math.round(u.share * 100)}% of its budget: {formatRp(u.spent)} of {formatRp(u.budget.amount)}.
              </Attention>
            ))}
            {recurringDue.length > 0 && (
              <Attention icon={Repeat} tone="info" action="Add them" onAction={() => navigate('/finance/budgets')}>
                {recurringDue.length} recurring cost{recurringDue.length === 1 ? '' : 's'} ({formatRp(recurringDue.reduce((n, c) => n + c.price, 0))}) not added for this month yet.
              </Attention>
            )}
            {unlinkedNow > 0 && (
              <Attention icon={Unlink} tone="info" action="Link them" onAction={() => navigate(`/production?${new URLSearchParams(sheetParams({ order: 'none', period: thisMonth })).toString()}`)}>
                {formatRp(unlinkedNow)} of bahan this month isn't linked to an order, so it's missing from order profits.
              </Attention>
            )}
          </ul>
        ) : (
          <p className="flex items-center gap-2 py-3 text-sm text-green-700"><CheckCircle2 size={16} /> Nothing needs attention: no overdue invoices, budgets on track, recurring costs added.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Invoiced" icon={Receipt} value={shortRp(t.invoiced)} sub={prevT ? delta(t.invoiced, prevT.invoiced) ?? formatRp(t.invoiced) : formatRp(t.invoiced)} />
        <Kpi label="Spent" icon={Wallet} value={shortRp(t.cost)} sub={`${shortRp(t.production)} bahan · ${shortRp(t.operation)} ops`} />
        <Kpi label="Profit" icon={TrendingUp} value={shortRp(t.profit)} tone={t.profit < 0 ? 'bad' : 'good'} sub={t.invoiced ? `${Math.round(margin * 100)}% margin` : undefined} />
        <Kpi label="Cash, in minus out" icon={PiggyBank} value={shortRp(t.cashIn - t.cost)} tone={t.cashIn - t.cost < 0 ? 'bad' : 'good'} sub={`${shortRp(t.cashIn)} paid in · ${pct(t.cashIn, t.invoiced)} of invoiced`} />
        <Kpi label="Owed to you" icon={Hourglass} value={shortRp(owed)} tone={overdue > 0 ? 'bad' : 'default'} sub={overdue > 0 ? `${shortRp(overdue)} overdue` : 'nothing overdue'} />
      </div>

      <Card title={`${year} month by month`} actions={<><Legend items={TREND_LEGEND} /><span className="text-xs text-slate-400 hidden md:inline">Click a month to look at it</span></>}>
        <TrendChart
          data={months.map((m, i) => ({ label: shortMonthLabel(m.month), invoiced: m.invoiced, cost: m.cost, profit: m.profit, lastYearProfit: lastYear[i].invoiced || lastYear[i].cost ? lastYear[i].profit : undefined }))}
          selected={selectedMonth}
          onSelect={i => setPeriod(p => (p.mode === 'month' && p.month === i && p.year === year ? { ...p, mode: 'year' } : { ...p, mode: 'month', year, month: i }))}
        />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card
          title="Where the money goes"
          actions={
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {([['supplier', 'Suppliers'], ['material', 'Bahan'], ['category', 'Operations']] as [Breakdown, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setBreakdown(k)} className={`px-2.5 py-1 text-xs font-medium rounded-md ${breakdown === k ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          }
        >
          <RankBars
            items={where}
            onSelect={id => (breakdown === 'supplier' ? openSheet('production', { group: id }) : breakdown === 'material' ? openSheet('production', { q: id }) : openSheet('operations', { group: id }))}
          />
          <p className="mt-3 text-xs text-slate-400">Click a row to open its lines.{unlinked > 0 && ` ${formatRp(unlinked)} of bahan in this period isn't linked to an order yet.`}</p>
        </Card>
        <Card title={`Cash in and out · ${periodLabel(period)}`} actions={<Legend items={CASH_LEGEND} />}>
          <CashFlowChart data={flow} />
        </Card>
      </div>

      <div className="card p-5 scroll-mt-20" id="owed">
        <div className="flex flex-wrap items-baseline gap-3 mb-3">
          <h3 className="font-semibold text-navy-900 text-sm">Owed to you</h3>
          <span className="font-mono text-sm text-slate-600">{formatRp(owed)}</span>
          <span className="text-xs text-slate-400">{open.length} unpaid invoice{open.length === 1 ? '' : 's'}</span>
        </div>
        <SplitBar parts={aging} />
        {open.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
              <thead><tr><th>Client</th><th>Invoice</th><th>Order</th><th>Due</th><th className="!text-right">Late</th><th className="!text-right">Amount</th></tr></thead>
              <tbody>
                {open.slice(0, 12).map(r => (
                  <tr key={r.invoice.id} className="cursor-pointer" onClick={() => navigate(`/orders/${encodeURIComponent(r.invoice.order_id)}`)}>
                    <td className="font-medium">{r.client}</td>
                    <td><span className="font-mono text-xs">{r.invoice.id}</span> <span className="text-xs text-slate-400">{r.invoice.type === 'dp' ? 'DP' : 'pelunasan'}</span></td>
                    <td className="font-mono text-xs">{r.invoice.order_id}</td>
                    <td className="text-xs">{dueOn(r.invoice)}</td>
                    <td className={`!text-right text-xs ${r.daysLate > 30 ? 'text-red-600 font-semibold' : r.daysLate > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{r.daysLate > 0 ? `${r.daysLate} days` : 'not due'}</td>
                    <td className="!text-right font-mono tabular-nums">{formatRp(invoiceAmount(r.invoice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open.length > 12 && <p className="mt-2 text-xs text-slate-400">and {open.length - 12} more in the Excel download</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="card p-5 overflow-x-auto">
          <h3 className="font-semibold text-navy-900 text-sm mb-3">Clients · {periodLabel(period)}</h3>
          {!byClient.length ? <p className="py-6 text-center text-sm text-slate-400">No orders in this period</p> : (
            <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
              <thead><tr><th>Client</th><th className="!text-right">Orders</th><th className="!text-right">Value</th><th className="!text-right">Costs</th><th className="!text-right">Profit</th><th className="!text-right">Owed</th></tr></thead>
              <tbody>
                {byClient.map(c => (
                  <tr key={c.key} className={c.clientId != null ? 'cursor-pointer' : ''} onClick={() => c.clientId != null && navigate(`/clients/${c.clientId}`)}>
                    <td className="font-medium truncate max-w-[12rem]">{c.name}</td>
                    <td className="!text-right">{c.orders}</td>
                    <td className="!text-right font-mono tabular-nums">{shortRp(c.value)}</td>
                    <td className="!text-right font-mono tabular-nums text-slate-500">{shortRp(c.costs)}</td>
                    <td className={`!text-right font-mono tabular-nums ${c.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>{shortRp(c.profit)} <span className="text-[10px] text-slate-400">{pct(c.profit, c.value)}</span></td>
                    <td className={`!text-right font-mono tabular-nums ${c.outstanding ? 'text-amber-600' : 'text-slate-300'}`}>{c.outstanding ? shortRp(c.outstanding) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5 overflow-x-auto">
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="font-semibold text-navy-900 text-sm">Orders · profit after linked costs</h3>
            <PiggyBank size={14} className="text-slate-300" />
          </div>
          {!periodStats.length ? <p className="py-6 text-center text-sm text-slate-400">No orders in this period</p> : (
            <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
              <thead><tr><th>Order</th><th className="!text-right">Value</th><th className="!text-right">Costs</th><th className="!text-right">Profit</th><th className="!text-right">Paid</th></tr></thead>
              <tbody>
                {periodStats.slice(0, 15).map(s => (
                  <tr key={s.order.id} className="cursor-pointer" onClick={() => navigate(`/orders/${encodeURIComponent(s.order.id)}`)}>
                    <td><span className="font-mono text-xs">{s.order.id}</span> <span className="text-xs text-slate-400 truncate">{s.client}</span></td>
                    <td className="!text-right font-mono tabular-nums">{shortRp(s.value)}</td>
                    <td className="!text-right font-mono tabular-nums text-slate-500">{s.costs ? shortRp(s.costs) : <span className="text-amber-500 text-[11px]" title="No Kas Bon lines are linked to this order yet">none linked</span>}</td>
                    <td className={`!text-right font-mono tabular-nums ${s.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>{shortRp(s.profit)} <span className="text-[10px] text-slate-400">{pct(s.profit, s.value)}</span></td>
                    <td className="!text-right text-xs text-slate-500">{pct(s.paid, s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
