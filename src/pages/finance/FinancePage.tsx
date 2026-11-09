import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AlertCircle, BarChart3, CheckCircle2, ChevronRight, Download, Hourglass, MessageCircle, PiggyBank, Printer, Receipt, Repeat, Scale, TrendingUp, Unlink, Wallet } from 'lucide-react'
import { formatRp } from '@/components/ui'
import { PageHeader, Card, LoadingState, ErrorState } from '@/components/ui/Page'
import { ScrollX } from '@/components/ui/ScrollX'
import {
  orderHooks, itemHooks, invoiceHooks, clientHooks, clientContactHooks, supplierHooks, productionHooks, operationHooks, buktiKasHooks, useBudgets, useRecurringCosts,
} from '@/hooks'
import { waLink, overdueReminderMessage, primaryContactPhone } from '@/utils/whatsapp'
import { monthLabel, shortMonthLabel } from '@/utils/MonthUtils'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import type { Invoice } from '@/types'
import { fromProduction, fromOperation, inPeriod, orderLabel, type Period } from '@/components/finance/ledgerModel'
import { PeriodPicker, periodLabel, periodSlug, currentPeriod } from '@/components/finance/PeriodPicker'
import { periodParam, sheetParams } from '@/components/finance/ledgerParams'
import {
  monthly, totals, cashFlow, receivables, orderStats, clientStats, dueOn, AGING, budgetUsage, monthKey,
} from '@/components/finance/financeStats'
import { TrendChart, trendLegend, CashFlowChart, cashLegend, Legend, RankBars, SplitBar, shortRp } from '@/components/finance/FinanceCharts'
import { ledgerSheet, exportLedger } from '@/components/finance/ledgerExport'
import type { SheetSpec } from '@/utils/xlsx'

type Breakdown = 'supplier' | 'material' | 'category'

function Kpi({ label, value, sub, icon: Icon, tone = 'default' }: {
  label: string; value: string; sub?: React.ReactNode; icon: React.ElementType; tone?: 'default' | 'good' | 'bad'
}) {
  const color = tone === 'good' ? 'text-green-700 dark:text-green-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-navy-900 dark:text-slate-50'
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon size={14} className="text-slate-500 dark:text-slate-400" />{label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold font-mono tabular-nums truncate ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 truncate dark:text-slate-400">{sub}</div>}
    </div>
  )
}

function Attention({ icon: Icon, tone, children, action, onAction }: {
  icon: React.ElementType; tone: 'bad' | 'warn' | 'info'; children: React.ReactNode; action: string; onAction: () => void
}) {
  const color = tone === 'bad' ? 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' : 'text-navy-600 bg-navy-50'
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}><Icon size={16} /></span>
      <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-300">{children}</span>
      <button className="btn-ghost btn-sm shrink-0" onClick={onAction}>{action} <ChevronRight size={14} /></button>
    </li>
  )
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
const delta = (now: number, before: number, t: TFunction) => {
  if (!before) return null
  const d = Math.round(((now - before) / Math.abs(before)) * 100)
  return t('financeOverview.vsLastYear', { arrow: d > 0 ? '▲' : d < 0 ? '▼' : '', percent: Math.abs(d) })
}

const AGING_KEYS: Record<string, string> = {
  current: 'financeOverview.aging.current',
  '1-30': 'financeOverview.aging.days1to30',
  '31-60': 'financeOverview.aging.days31to60',
  '61-90': 'financeOverview.aging.days61to90',
  '90+': 'financeOverview.aging.over90',
}

/** Money in and out across the business: the year month by month, where it
 *  goes, who owes what, and how each client and order did. */
export function FinancePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>(() => currentPeriod('year'))
  const [breakdown, setBreakdown] = useState<Breakdown>('supplier')
  // Both tables below are sorted by value already; past the first handful,
  // a long scroll of low-value rows was costing more screen than it earned.
  // Collapsed by default, same data either way — nothing here needs a trip
  // to Excel just to see client/order #6.
  const [showAllClients, setShowAllClients] = useState(false)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllOwed, setShowAllOwed] = useState(false)
  const ROW_PREVIEW = 5

  const ordersQ = orderHooks.useList()
  const itemsQ = itemHooks.useList()
  const invoicesQ = invoiceHooks.useList()
  const clientsQ = clientHooks.useList()
  const suppliersQ = supplierHooks.useList()
  const productionQ = productionHooks.useList()
  const operationQ = operationHooks.useList()
  const buktiKasQ = buktiKasHooks.useList()
  const contactsQ = clientContactHooks.useList()
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
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data])

  const year = period.mode === 'month' || period.mode === 'year' ? period.year : new Date().getFullYear()
  const months = useMemo(() => monthly(year, invoices, costs, buktiKas), [year, invoices, costs, buktiKas])
  const lastYear = useMemo(() => monthly(year - 1, invoices, costs, buktiKas), [year, invoices, costs, buktiKas])
  const tot = useMemo(() => totals(period, invoices, costs, buktiKas), [period, invoices, costs, buktiKas])
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
      if (breakdown === 'category' && c.kind === 'operation') add(c.category, c.category || t('financeOverview.uncategorized'), c.total)
      if (c.kind !== 'production') continue
      if (breakdown === 'supplier') {
        const s = suppliers.find(x => x.id === c.supplier_id)
        add(String(c.supplier_id), s?.supplier_name ?? t('financeOverview.noSupplier'), c.total, s ? CATEGORY_COLORS[s.supplier_category] : undefined)
      } else if (breakdown === 'material') {
        add(c.name, c.name, c.total)
      }
    }
    return [...sum.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value).slice(0, 12)
  }, [periodCosts, breakdown, suppliers, t])

  const aging = AGING.map(b => ({ key: b.key, label: AGING_KEYS[b.key] ? t(AGING_KEYS[b.key]) : b.label, color: b.color, value: open.filter(r => r.bucket === b.key).reduce((n, r) => n + r.amount, 0) }))
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

  if (queries.some(q => q.isLoading)) return <LoadingState label={t('financeOverview.loading')} />
  if (queries.some(q => q.isError)) {
    return <div className="p-4 md:p-6"><div className="card"><ErrorState what={t('financeOverview.errorWhat')} onRetry={() => queries.forEach(q => q.refetch())} /></div></div>
  }

  const margin = tot.invoiced ? tot.profit / tot.invoiced : 0
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <PageHeader
        icon={BarChart3}
        title={t('financeOverview.title')}
        subtitle={t('financeOverview.subtitle', { period: periodLabel(period) })}
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            {(period.mode === 'month' || period.mode === 'year') && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => navigate(`/finance/report?mode=${period.mode}&year=${period.year}&month=${period.month}`)}
                title={t('financeOverview.printReportTitle')}
              >
                <Printer size={14} /> {t('financeOverview.printReport')}
              </button>
            )}
            <button className="btn-secondary btn-sm" onClick={download} title={t('financeOverview.excelTitle')}><Download size={14} /> Excel</button>
          </>
        }
      />

      <Card title={t('financeOverview.needsAttention', { month: monthLabel(now.getFullYear(), now.getMonth()) })} icon={AlertCircle} bodyClassName="px-5 pb-2">
        {late.length || tight.length || recurringDue.length || unlinkedNow > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {late.length > 0 && (
              <Attention icon={Hourglass} tone="bad" action={t('financeOverview.seeWho')} onAction={() => document.getElementById('owed')?.scrollIntoView({ behavior: 'smooth' })}>
                <Trans i18nKey="financeOverview.overdueInvoices" count={late.length} values={{ amount: formatRp(late.reduce((n, r) => n + r.amount, 0)), days: late[0].daysLate, client: late[0].client }} components={{ b: <b /> }} />
              </Attention>
            )}
            {tight.map(u => (
              <Attention key={u.budget.id} icon={Scale} tone={u.share > 1 ? 'bad' : 'warn'} action={t('financeOverview.budgets')} onAction={() => navigate('/finance/budgets')}>
                <Trans i18nKey="financeOverview.budgetTight" values={{ label: u.label, percent: Math.round(u.share * 100), spent: formatRp(u.spent), budget: formatRp(u.budget.amount) }} components={{ b: <b /> }} />
              </Attention>
            ))}
            {recurringDue.length > 0 && (
              <Attention icon={Repeat} tone="info" action={t('financeOverview.addThem')} onAction={() => navigate('/finance/budgets')}>
                {t('financeOverview.recurringDue', { count: recurringDue.length, amount: formatRp(recurringDue.reduce((n, c) => n + c.price, 0)) })}
              </Attention>
            )}
            {unlinkedNow > 0 && (
              <Attention icon={Unlink} tone="info" action={t('financeOverview.linkThem')} onAction={() => navigate(`/production?${new URLSearchParams(sheetParams({ order: 'none', period: thisMonth })).toString()}`)}>
                {t('financeOverview.unlinkedThisMonth', { amount: formatRp(unlinkedNow) })}
              </Attention>
            )}
          </ul>
        ) : (
          <p className="flex items-center gap-2 py-3 text-sm text-green-700 dark:text-green-400"><CheckCircle2 size={16} /> {t('financeOverview.nothingNeedsAttention')}</p>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={t('financeCharts.invoiced')} icon={Receipt} value={shortRp(tot.invoiced)} sub={prevT ? delta(tot.invoiced, prevT.invoiced, t) ?? formatRp(tot.invoiced) : formatRp(tot.invoiced)} />
        <Kpi label={t('financeCharts.spent')} icon={Wallet} value={shortRp(tot.cost)} sub={t('financeOverview.spentSub', { production: shortRp(tot.production), operation: shortRp(tot.operation) })} />
        <Kpi label={t('common.profit')} icon={TrendingUp} value={shortRp(tot.profit)} tone={tot.profit < 0 ? 'bad' : 'good'} sub={tot.invoiced ? t('financeOverview.marginSub', { percent: Math.round(margin * 100) }) : undefined} />
        <Kpi label={t('financeOverview.cashInMinusOut')} icon={PiggyBank} value={shortRp(tot.cashIn - tot.cost)} tone={tot.cashIn - tot.cost < 0 ? 'bad' : 'good'} sub={t('financeOverview.cashSub', { paidIn: shortRp(tot.cashIn), share: pct(tot.cashIn, tot.invoiced) })} />
        <Kpi label={t('financeOverview.owedToYou')} icon={Hourglass} value={shortRp(owed)} tone={overdue > 0 ? 'bad' : 'default'} sub={overdue > 0 ? t('financeOverview.overdueAmount', { amount: shortRp(overdue) }) : t('financeOverview.nothingOverdue')} />
      </div>

      <Card title={t('financeOverview.monthByMonth', { year })} actions={<><Legend items={trendLegend(t)} /><span className="text-xs text-slate-500 hidden md:inline dark:text-slate-400">{t('financeOverview.clickMonth')}</span></>}>
        <TrendChart
          data={months.map((m, i) => ({ label: shortMonthLabel(m.month), invoiced: m.invoiced, cost: m.cost, profit: m.profit, lastYearProfit: lastYear[i].invoiced || lastYear[i].cost ? lastYear[i].profit : undefined }))}
          selected={selectedMonth}
          onSelect={i => setPeriod(p => (p.mode === 'month' && p.month === i && p.year === year ? { ...p, mode: 'year' } : { ...p, mode: 'month', year, month: i }))}
        />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card
          title={t('financeOverview.whereMoneyGoes')}
          actions={
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/10">
              {([['supplier', t('financeOverview.suppliers')], ['material', 'Bahan'], ['category', t('common.operations')]] as [Breakdown, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setBreakdown(k)} className={`px-2.5 py-1 text-xs font-medium rounded-md ${breakdown === k ? 'bg-white text-navy-900 shadow-sm dark:bg-navy-900 dark:text-slate-50' : 'text-slate-600 dark:text-slate-400'}`}>{label}</button>
              ))}
            </div>
          }
        >
          <RankBars
            items={where}
            onSelect={id => (breakdown === 'supplier' ? openSheet('production', { group: id }) : breakdown === 'material' ? openSheet('production', { q: id }) : openSheet('operations', { group: id }))}
          />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('financeOverview.clickRow')}{unlinked > 0 && ` ${t('financeOverview.unlinkedInPeriod', { amount: formatRp(unlinked) })}`}</p>
        </Card>
        <Card title={t('financeOverview.cashInOut', { period: periodLabel(period) })} actions={<Legend items={cashLegend(t)} />}>
          <CashFlowChart data={flow} />
        </Card>
      </div>

      <Card
        id="owed"
        className="scroll-mt-20"
        title={
          <span className="inline-flex flex-wrap items-baseline gap-3">
            {t('financeOverview.owedToYou')}
            <span className="font-mono font-normal text-slate-600 dark:text-slate-300">{formatRp(owed)}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t('financeOverview.unpaidInvoices', { count: open.length })}</span>
          </span>
        }
      >
        <SplitBar parts={aging} />
        {open.length > 0 && (
          <div className="mt-4">
            <ScrollX>
              <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
              <thead><tr><th>{t('common.client')}</th><th>{t('financeOverview.columns.invoice')}</th><th>{t('financeOverview.columns.order')}</th><th>{t('financeOverview.columns.due')}</th><th className="!text-right">{t('financeOverview.columns.late')}</th><th className="!text-right">{t('financeOverview.columns.amount')}</th><th /></tr></thead>
              <tbody>
                {(showAllOwed ? open : open.slice(0, ROW_PREVIEW)).map(r => {
                  const clientId = orders.find(o => o.id === r.invoice.order_id)?.client_id ?? null
                  const wa = r.daysLate > 0 ? waLink(primaryContactPhone(clientId, contacts), overdueReminderMessage({
                    clientName: r.client, invoiceId: r.invoice.id, orderId: r.invoice.order_id,
                    daysLate: r.daysLate, amount: r.amount,
                  })) : null
                  return (
                  <tr key={r.invoice.id} className="cursor-pointer" onClick={() => navigate(`/orders/${encodeURIComponent(r.invoice.order_id)}`)}>
                    <td className="font-medium">{r.client}</td>
                    <td><span className="font-mono text-xs">{r.invoice.id}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{r.invoice.type === 'dp' ? 'DP' : 'pelunasan'}</span></td>
                    <td className="font-mono text-xs">{r.invoice.order_id}</td>
                    <td className="text-xs">{dueOn(r.invoice)}</td>
                    <td className={`!text-right text-xs ${r.daysLate > 30 ? 'text-red-600 font-semibold dark:text-red-400' : r.daysLate > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>{r.daysLate > 0 ? t('financeOverview.daysLate', { days: r.daysLate }) : t('financeOverview.notDue')}</td>
                    <td className="!text-right font-mono tabular-nums">{formatRp(r.amount)}</td>
                    <td className="!text-right">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title={t('financeOverview.remindOnWhatsapp')}
                          className="inline-flex w-6 h-6 rounded-md items-center justify-center text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
              </ScrollX>
            {open.length > ROW_PREVIEW && (
              <button className="btn-ghost btn-sm mt-2" onClick={() => setShowAllOwed(v => !v)}>
                {showAllOwed ? t('financeOverview.showLess') : t('financeOverview.showAllUnpaid', { total: open.length })} <ChevronRight size={14} className={`transition-transform ${showAllOwed ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Side by side only where both fit whole: at laptop widths the two
          tables cut off their last columns (Owed, Profit). */}
      <div className="grid grid-cols-1 min-[1760px]:grid-cols-2 gap-5 items-start">
        <Card title={t('financeOverview.clientsInPeriod', { period: periodLabel(period) })} bodyClassName="p-5">
          {!byClient.length ? <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{t('financeOverview.noOrdersInPeriod')}</p> : (
            <>
              <ScrollX>
              <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
                <thead><tr><th>{t('common.client')}</th><th className="!text-right">{t('financeOverview.columns.orders')}</th><th className="!text-right">{t('financeOverview.columns.value')}</th><th className="!text-right">{t('financeOverview.columns.costs')}</th><th className="!text-right">{t('common.profit')}</th><th className="!text-right">{t('financeOverview.columns.owed')}</th></tr></thead>
                <tbody>
                  {(showAllClients ? byClient : byClient.slice(0, ROW_PREVIEW)).map(c => (
                    <tr key={c.key} className={c.clientId != null ? 'cursor-pointer' : ''} onClick={() => c.clientId != null && navigate(`/clients/${c.clientId}`)}>
                      <td className="font-medium truncate max-w-[20rem]">{c.name}</td>
                      <td className="!text-right">{c.orders}</td>
                      <td className="!text-right font-mono tabular-nums">{shortRp(c.value)}</td>
                      <td className="!text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">{shortRp(c.costs)}</td>
                      <td className={`!text-right font-mono tabular-nums ${c.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{shortRp(c.profit)} <span className="text-[10px] text-slate-500 dark:text-slate-400">{pct(c.profit, c.value)}</span></td>
                      <td className={`!text-right font-mono tabular-nums ${c.outstanding ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300 dark:text-navy-700'}`}>{c.outstanding ? shortRp(c.outstanding) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </ScrollX>
              {byClient.length > ROW_PREVIEW && (
                <button className="btn-ghost btn-sm mt-2" onClick={() => setShowAllClients(v => !v)}>
                  {showAllClients ? t('financeOverview.showLess') : t('financeOverview.showAllClients', { total: byClient.length })} <ChevronRight size={14} className={`transition-transform ${showAllClients ? '-rotate-90' : 'rotate-90'}`} />
                </button>
              )}
            </>
          )}
        </Card>
        <Card title={t('financeOverview.ordersProfit')} icon={PiggyBank} bodyClassName="p-5">
          {!periodStats.length ? <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{t('financeOverview.noOrdersInPeriod')}</p> : (
            <>
              <ScrollX>
              <table className="kma-table text-xs [&_td]:!px-2 [&_th]:!px-2 [&_td]:whitespace-nowrap">
                <thead><tr><th>{t('financeOverview.columns.order')}</th><th className="!text-right">{t('financeOverview.columns.value')}</th><th className="!text-right">{t('financeOverview.columns.costs')}</th><th className="!text-right">{t('common.profit')}</th><th className="!text-right">{t('financeOverview.columns.paid')}</th></tr></thead>
                <tbody>
                  {(showAllOrders ? periodStats : periodStats.slice(0, ROW_PREVIEW)).map(s => (
                    <tr key={s.order.id} className="cursor-pointer" onClick={() => navigate(`/orders/${encodeURIComponent(s.order.id)}`)}>
                      <td><span className="font-mono text-xs">{s.order.id}</span> <span className="text-xs text-slate-500 truncate dark:text-slate-400">{s.client}</span></td>
                      <td className="!text-right font-mono tabular-nums">{shortRp(s.value)}</td>
                      <td className="!text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">{s.costs ? shortRp(s.costs) : <span className="text-amber-500 text-[11px] dark:text-amber-400" title={t('financeOverview.noKasBonLinked')}>{t('financeOverview.noneLinked')}</span>}</td>
                      <td className={`!text-right font-mono tabular-nums ${s.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{shortRp(s.profit)} <span className="text-[10px] text-slate-500 dark:text-slate-400">{pct(s.profit, s.value)}</span></td>
                      <td className="!text-right text-xs text-slate-500 dark:text-slate-400">{pct(s.paid, s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </ScrollX>
              {periodStats.length > ROW_PREVIEW && (
                <button className="btn-ghost btn-sm mt-2" onClick={() => setShowAllOrders(v => !v)}>
                  {showAllOrders ? t('financeOverview.showLess') : t('financeOverview.showAllOrders', { total: periodStats.length })} <ChevronRight size={14} className={`transition-transform ${showAllOrders ? '-rotate-90' : 'rotate-90'}`} />
                </button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
