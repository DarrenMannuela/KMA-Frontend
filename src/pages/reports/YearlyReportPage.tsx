import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, Factory, Receipt, ShoppingBag, Truck, TrendingUp } from 'lucide-react'
import { formatRp, StatCard } from '@/components/ui'
import { DivergingBarChart } from '@/components/ui/Charts'
import { YearNavigator } from '@/components/ui/YearNavigator'
import { orderHooks, deliveryHooks, productionHooks, operationHooks, invoiceHooks } from '@/hooks'
import { isInYear, monthIndexOf, shortMonthLabel } from '@/utils/MonthUtils'
import type { Invoice, ProductionRow, OperationRow } from '@/types'

// Same "amount THIS invoice document is for" helper as DashboardPage —
// duplicated rather than shared, same convention this app already uses
// for small per-file derived-value helpers (e.g. CATEGORY_LABELS repeated
// across ProductionDashboard/ProductionsSpreadsheet/ProductionSheetView).
function invoiceAmountDue(inv: Invoice): number {
  return inv.type === 'dp' ? (inv.down_payment ?? 0) : inv.remaining
}

interface MonthRow {
  month: number
  label: string
  orderCount: number
  invoicedPaid: number
  invoicedUnpaid: number
  productionCost: number
  operationsCost: number
}

export function YearlyReportPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(new Date().getFullYear())

  const { data: orders = [] }      = orderHooks.useList()
  const { data: deliveries = [] }  = deliveryHooks.useList()
  const { data: invoices = [] }    = invoiceHooks.useList()
  const { data: productions = [] } = productionHooks.useList()
  const { data: operations = [] }  = operationHooks.useList()

  // One pass building all 12 months' worth of numbers for the selected
  // year — everything below (charts, stat cards, the table) reads from
  // this instead of re-filtering the raw lists per section.
  const monthRows: MonthRow[] = useMemo(() => {
    const rows: MonthRow[] = Array.from({ length: 12 }, (_, month) => ({
      month, label: shortMonthLabel(month),
      orderCount: 0, invoicedPaid: 0, invoicedUnpaid: 0, productionCost: 0, operationsCost: 0,
    }))

    orders.filter(o => isInYear(o.date, year)).forEach(o => {
      const m = monthIndexOf(o.date)
      if (m != null) rows[m].orderCount += 1
    })

    ;(invoices as Invoice[]).filter(i => isInYear(i.tanggal, year)).forEach(i => {
      const m = monthIndexOf(i.tanggal)
      if (m == null) return
      if (i.status === 'paid') rows[m].invoicedPaid += invoiceAmountDue(i)
      else rows[m].invoicedUnpaid += invoiceAmountDue(i)
    })

    ;(productions as ProductionRow[]).filter(p => isInYear(p.date, year)).forEach(p => {
      const m = monthIndexOf(p.date)
      if (m != null) rows[m].productionCost += p.price * p.amount
    })

    ;(operations as OperationRow[]).filter(o => isInYear(o.date, year)).forEach(o => {
      const m = monthIndexOf(o.date)
      if (m != null) rows[m].operationsCost += o.price
    })

    return rows
  }, [orders, invoices, productions, operations, year])

  const yearTotals = monthRows.reduce((acc, r) => ({
    orderCount: acc.orderCount + r.orderCount,
    invoicedPaid: acc.invoicedPaid + r.invoicedPaid,
    invoicedUnpaid: acc.invoicedUnpaid + r.invoicedUnpaid,
    productionCost: acc.productionCost + r.productionCost,
    operationsCost: acc.operationsCost + r.operationsCost,
  }), { orderCount: 0, invoicedPaid: 0, invoicedUnpaid: 0, productionCost: 0, operationsCost: 0 })

  const deliveriesThisYear = deliveries.filter(d => isInYear(d.date, year)).length
  const netProfitLoss = yearTotals.invoicedPaid + yearTotals.invoicedUnpaid - yearTotals.productionCost - yearTotals.operationsCost

  // One number per month: what was invoiced (Paid + Unpaid — the value
  // earned that month, whether collected yet or not) minus what was spent
  // on Production + Operations. This is the one chart the page needs —
  // previously this page had three separate charts (Invoiced by month,
  // a Cost-split donut for the year, and Cost by month) that each
  // restated the same Revenue/Cost numbers in a different shape without
  // ever showing the number that actually answers "how's the year going":
  // the gap between them.
  const profitLossBarData = monthRows.map(r => ({
    category: r.label,
    value: (r.invoicedPaid + r.invoicedUnpaid) - (r.productionCost + r.operationsCost),
  }))

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Goes back in history rather than a hardcoded '/' — this page
              is reachable from more than one place (dashboard's "Yearly
              view" link, sidebar nav, etc.), so history is the one target
              that's always "wherever they came from". */}
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BarChart3 className="w-5 h-5 text-navy-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Yearly Report</h2>
            <p className="text-xs text-slate-400">Orders, invoicing, and cost breakdown for {year}</p>
          </div>
        </div>
        <YearNavigator year={year} onChange={setYear} />
      </div>

      {/* ── Year summary ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Orders"          value={yearTotals.orderCount}   icon={ShoppingBag} sub={`Placed in ${year}`} />
        <StatCard label="Deliveries"      value={deliveriesThisYear}      icon={Truck}       sub={`Sent in ${year}`} />
        <StatCard label="Invoiced (Paid)" value={formatRp(yearTotals.invoicedPaid)}   icon={Receipt} sub="Collected this year" />
        <StatCard label="Invoiced (Unpaid)" value={formatRp(yearTotals.invoicedUnpaid)} icon={Receipt} sub="Still outstanding" />
        <StatCard label="Production + Ops" value={formatRp(yearTotals.productionCost + yearTotals.operationsCost)} icon={Factory} sub="Total cost this year" />
        <StatCard
          label={netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss'}
          value={formatRp(Math.abs(netProfitLoss))}
          icon={TrendingUp}
          sub={`Invoiced minus cost, ${year}`}
          accent
        />
      </div>

      {/* ── Profit / Loss by month ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-navy-400" />
          <h3 className="font-semibold text-navy-900 text-sm">Profit / Loss by Month — Invoiced minus Production + Operations Cost</h3>
        </div>
        <DivergingBarChart
          data={profitLossBarData}
          height={240}
          emptyLabel={`No orders, invoicing, or cost activity recorded in ${year}`}
        />
      </div>

      {/* ── Monthly breakdown table ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-navy-900 text-sm">Monthly Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="kma-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Orders</th>
                <th>Invoiced (Paid)</th>
                <th>Invoiced (Unpaid)</th>
                <th>Production Cost</th>
                <th>Operations Cost</th>
                <th>Total Cost</th>
                <th>Net Profit/Loss</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map(r => {
                const net = (r.invoicedPaid + r.invoicedUnpaid) - (r.productionCost + r.operationsCost)
                return (
                  <tr key={r.month}>
                    <td className="font-medium text-navy-900">{r.label}</td>
                    <td>{r.orderCount}</td>
                    <td className="font-mono text-green-700">{formatRp(r.invoicedPaid)}</td>
                    <td className="font-mono text-red-600">{formatRp(r.invoicedUnpaid)}</td>
                    <td className="font-mono">{formatRp(r.productionCost)}</td>
                    <td className="font-mono">{formatRp(r.operationsCost)}</td>
                    <td className="font-mono font-semibold">{formatRp(r.productionCost + r.operationsCost)}</td>
                    <td className={`font-mono font-semibold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {net >= 0 ? '+' : '-'}{formatRp(Math.abs(net))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-navy-900 text-white">
                <td className="font-semibold">Total</td>
                <td className="font-semibold">{yearTotals.orderCount}</td>
                <td className="font-mono font-bold">{formatRp(yearTotals.invoicedPaid)}</td>
                <td className="font-mono font-bold">{formatRp(yearTotals.invoicedUnpaid)}</td>
                <td className="font-mono font-bold">{formatRp(yearTotals.productionCost)}</td>
                <td className="font-mono font-bold">{formatRp(yearTotals.operationsCost)}</td>
                <td className="font-mono font-bold">{formatRp(yearTotals.productionCost + yearTotals.operationsCost)}</td>
                <td className={`font-mono font-bold ${netProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netProfitLoss >= 0 ? '+' : '-'}{formatRp(Math.abs(netProfitLoss))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}