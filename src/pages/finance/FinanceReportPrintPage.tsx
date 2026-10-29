import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { orderHooks, itemHooks, invoiceHooks, clientHooks, supplierHooks, productionHooks, operationHooks, buktiKasHooks } from '@/hooks'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { formatRp } from '@/components/ui'
import { fromProduction, fromOperation, inPeriod, previousPeriod, type Period } from '@/components/finance/ledgerModel'
import { periodLabel } from '@/components/finance/PeriodPicker'
import { monthly, totals, receivables, orderStats, clientStats, dueOn, AGING } from '@/components/finance/financeStats'
import { shortMonthLabel } from '@/utils/MonthUtils'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import type { Invoice } from '@/types'
import { usePrintLightBody } from '@/hooks/usePrintLightBody'

// A printable monthly or yearly summary — same underlying numbers as the
// Finance Overview page (same financeStats functions, so the two can never
// quietly disagree), laid out as a document instead of an interactive
// dashboard. Content flows across as many pages as it needs: no measurement
// or page-break prediction here (contrast InvoicePrintPage's own, much more
// involved system) — a report's tables are expected to run long, and a
// table simply continuing onto the next page with its header repeated is
// the normal, acceptable thing for a report to do. Section boundaries use
// `break-inside: avoid` only where a stray split would look broken (the KPI
// row, the letterhead), not on the long tables themselves.
function periodFromParams(params: URLSearchParams): Period {
  const mode = params.get('mode') === 'year' ? 'year' : 'month'
  const year = Number(params.get('year')) || new Date().getFullYear()
  const month = Math.min(11, Math.max(0, Number(params.get('month')) || 0))
  return { mode, year, month, from: '', to: '' }
}

const money = (v: number) => formatRp(v)
// Profit is the only figure here that can genuinely go negative (a loss) —
// Invoiced/Spent/Cash in/Owed are all non-negative sums, so coloring those
// red/green wouldn't mean anything. Darker shades than the UI's own
// red/green-500 for better contrast printed on plain white paper.
const profitColor = (v: number) => (v > 0 ? '#15803d' : v < 0 ? '#b91c1c' : undefined)
/** Same convention as the Finance Overview page's own delta(), generalized
 *  to either period mode instead of a hardcoded "vs last year". */
function delta(now: number, before: number, vsLabel: string): string | null {
  if (!before) return null
  const d = Math.round(((now - before) / Math.abs(before)) * 100)
  return `${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d)}% vs ${vsLabel}`
}

export function FinanceReportPrintPage() {
  usePrintLightBody()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const period = periodFromParams(searchParams)
  const isYear = period.mode === 'year'

  const ordersQ = orderHooks.useList()
  const itemsQ = itemHooks.useList()
  const invoicesQ = invoiceHooks.useList()
  const clientsQ = clientHooks.useList()
  const suppliersQ = supplierHooks.useList()
  const productionQ = productionHooks.useList()
  const operationQ = operationHooks.useList()
  const buktiKasQ = buktiKasHooks.useList()
  const queries = [ordersQ, itemsQ, invoicesQ, clientsQ, suppliersQ, productionQ, operationQ, buktiKasQ]

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const invoices = useMemo(() => (invoicesQ.data ?? []) as Invoice[], [invoicesQ.data])
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data])
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data])
  const costs = useMemo(() => [...(productionQ.data ?? []).map(fromProduction), ...(operationQ.data ?? []).map(fromOperation)], [productionQ.data, operationQ.data])
  const buktiKas = useMemo(() => buktiKasQ.data ?? [], [buktiKasQ.data])

  const months = useMemo(() => monthly(period.year, invoices, costs, buktiKas), [period.year, invoices, costs, buktiKas])
  const t = useMemo(() => totals(period, invoices, costs, buktiKas), [period, invoices, costs, buktiKas])
  const prevPeriod = useMemo(() => previousPeriod(period), [period])
  const prevT = useMemo(() => (prevPeriod ? totals(prevPeriod, invoices, costs, buktiKas) : null), [prevPeriod, invoices, costs, buktiKas])
  const prevLabel = prevPeriod ? periodLabel(prevPeriod) : ''
  // Receivables are a snapshot of what's owed right now, not scoped to the
  // report's period — same as the Finance Overview, and the only sensible
  // reading for "Owed to you" on a document meant to be handed to someone.
  const open = useMemo(() => receivables(invoices, orders, clients), [invoices, orders, clients])
  const owed = open.reduce((n, r) => n + r.amount, 0)

  const inPeriodOrders = useMemo(() => orders.filter(o => inPeriod(o.date, period)), [orders, period])
  const stats = useMemo(() => orderStats(orders, items, invoices, costs, clients), [orders, items, invoices, costs, clients])
  const periodStats = useMemo(() => inPeriodOrders.map(o => stats.get(o.id)!).filter(Boolean).sort((a, b) => b.value - a.value), [inPeriodOrders, stats])
  const byClient = useMemo(() => clientStats(periodStats, open, orders), [periodStats, open, orders])

  const periodCosts = useMemo(() => costs.filter(c => inPeriod(c.date, period)), [costs, period])
  const where = useMemo(() => {
    const sum = new Map<string, { label: string; value: number; color?: string }>()
    for (const c of periodCosts) {
      if (c.kind !== 'production') continue
      const s = suppliers.find(x => x.id === c.supplier_id)
      const key = String(c.supplier_id)
      const cur = sum.get(key) ?? { label: s?.supplier_name ?? 'No supplier', value: 0, color: s ? CATEGORY_COLORS[s.supplier_category] : undefined }
      cur.value += c.total
      sum.set(key, cur)
    }
    return [...sum.values()].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [periodCosts, suppliers])
  const whereOps = useMemo(() => {
    const sum = new Map<string, number>()
    for (const c of periodCosts) {
      if (c.kind !== 'operation') continue
      const key = c.category || 'Uncategorized'
      sum.set(key, (sum.get(key) ?? 0) + c.total)
    }
    return [...sum.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [periodCosts])

  if (queries.some(q => q.isLoading)) return <LoadingState label="Loading the report…" />
  if (queries.some(q => q.isError)) {
    return <div className="p-4 md:p-6"><div className="card"><ErrorState what="the finance data" onRetry={() => queries.forEach(q => q.refetch())} /></div></div>
  }

  const title = isYear ? 'Yearly Report' : 'Monthly Report'
  const margin = t.invoiced ? Math.round((t.profit / t.invoiced) * 100) : null

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">{title} — {periodLabel(period)}</span>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      <div className="py-8 print:py-0 flex justify-center">
        <div id="finance-report" className="bg-white shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm', padding: '15mm 16mm', fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '11px' }}>
          {/* Letterhead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', breakInside: 'avoid' }}>
            <img src="/Logo.png" alt="KMA Logo" style={{ width: '52px', height: 'auto', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '17px', letterSpacing: '0.5px' }}>KREASI MAKMUR ABADI</div>
              <div style={{ fontSize: '10px', color: '#555' }}>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55, JAKARTA UTARA 14450</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{title.toUpperCase()}</div>
              <div style={{ fontSize: '12px', color: '#333' }}>{periodLabel(period)}</div>
              <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Generated {format(new Date(), 'd MMMM yyyy, HH:mm')}</div>
            </div>
          </div>
          <div style={{ borderTop: '2px solid #000', marginBottom: '16px' }} />

          {/* KPI summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px', breakInside: 'avoid' }}>
            {[
              { label: 'Invoiced', value: t.invoiced, subs: [prevT ? delta(t.invoiced, prevT.invoiced, prevLabel) : null] },
              { label: 'Spent', value: t.cost, subs: [`${money(t.production)} bahan · ${money(t.operation)} ops`, prevT ? delta(t.cost, prevT.cost, prevLabel) : null] },
              { label: 'Profit', value: t.profit, subs: [margin != null ? `${margin}% margin` : null, prevT ? delta(t.profit, prevT.profit, prevLabel) : null] },
              { label: 'Cash in', value: t.cashIn, subs: [prevT ? delta(t.cashIn, prevT.cashIn, prevLabel) : null] },
              { label: 'Owed to you', value: owed, subs: [`${open.length} unpaid invoice${open.length === 1 ? '' : 's'}`] },
              { label: 'Orders in period', value: inPeriodOrders.length, subs: [] },
            ].map(({ label, value, subs }) => (
              <div key={label} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                <div style={{ fontWeight: 'bold', fontSize: '14px', fontFamily: 'monospace', color: label === 'Profit' ? profitColor(value) : undefined }}>
                  {label === 'Orders in period' ? value : money(value)}
                </div>
                {subs.filter((s): s is string => s != null).map((s, i) => (
                  <div key={i} style={{ fontSize: '9px', color: '#888' }}>{s}</div>
                ))}
              </div>
            ))}
          </div>

          {/* Month by month (full year, selected month marked when reporting on one) */}
          <Section title={`${period.year} · Month by month`}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={thStyle}>Month</th>
                  <th style={thStyleRight}>Invoiced</th>
                  <th style={thStyleRight}>Spent</th>
                  <th style={thStyleRight}>Profit</th>
                  <th style={thStyleRight}>Cash In</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} style={!isYear && m.month === period.month ? { background: '#eef2ff' } : undefined}>
                    <td style={tdStyle}>{shortMonthLabel(m.month)} {period.year}{!isYear && m.month === period.month ? ' ←' : ''}</td>
                    <td style={tdStyleRight}>{money(m.invoiced)}</td>
                    <td style={tdStyleRight}>{money(m.cost)}</td>
                    <td style={{ ...tdStyleRight, color: profitColor(m.profit) }}>{money(m.profit)}</td>
                    <td style={tdStyleRight}>{money(m.cashIn)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1.5px solid #000', fontWeight: 'bold' }}>
                  <td style={tdStyle}>Total {period.year}</td>
                  <td style={tdStyleRight}>{money(months.reduce((n, m) => n + m.invoiced, 0))}</td>
                  <td style={tdStyleRight}>{money(months.reduce((n, m) => n + m.cost, 0))}</td>
                  <td style={{ ...tdStyleRight, color: profitColor(months.reduce((n, m) => n + m.profit, 0)) }}>{money(months.reduce((n, m) => n + m.profit, 0))}</td>
                  <td style={tdStyleRight}>{money(months.reduce((n, m) => n + m.cashIn, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Where the money went */}
          <Section title={`Where the money went · ${periodLabel(period)}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }}>By supplier · bahan</div>
                {where.length === 0 ? <Empty text="No bahan costs in this period." /> : (
                  <table style={tableStyle}>
                    <thead><tr style={theadRowStyle}><th style={thStyle}>Supplier</th><th style={thStyleRight}>Spent</th></tr></thead>
                    <tbody>
                      {where.map(w => (
                        <tr key={w.label}>
                          <td style={tdStyle}>
                            {w.color && <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: w.color, marginRight: '6px' }} />}
                            {w.label}
                          </td>
                          <td style={tdStyleRight}>{money(w.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }}>By category · operations</div>
                {whereOps.length === 0 ? <Empty text="No operations costs in this period." /> : (
                  <table style={tableStyle}>
                    <thead><tr style={theadRowStyle}><th style={thStyle}>Category</th><th style={thStyleRight}>Spent</th></tr></thead>
                    <tbody>
                      {whereOps.map(w => (
                        <tr key={w.label}>
                          <td style={tdStyle}>{w.label}</td>
                          <td style={tdStyleRight}>{money(w.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Section>

          {/* Clients */}
          <Section title={`Clients · ${periodLabel(period)}`}>
            {byClient.length === 0 ? <Empty text="No orders in this period." /> : (
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>Client</th><th style={thStyleRight}>Orders</th><th style={thStyleRight}>Value</th>
                    <th style={thStyleRight}>Costs</th><th style={thStyleRight}>Profit</th><th style={thStyleRight}>Owed now</th>
                  </tr>
                </thead>
                <tbody>
                  {byClient.map(c => (
                    <tr key={c.key}>
                      <td style={tdStyle}>{c.name}</td>
                      <td style={tdStyleRight}>{c.orders}</td>
                      <td style={tdStyleRight}>{money(c.value)}</td>
                      <td style={tdStyleRight}>{money(c.costs)}</td>
                      <td style={{ ...tdStyleRight, color: profitColor(c.profit) }}>{money(c.profit)}</td>
                      <td style={tdStyleRight}>{money(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Orders */}
          <Section title={`Orders · profit after linked costs · ${periodLabel(period)}`}>
            {periodStats.length === 0 ? <Empty text="No orders in this period." /> : (
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>Order</th><th style={thStyle}>Client</th>
                    <th style={thStyleRight}>Value</th><th style={thStyleRight}>Costs</th><th style={thStyleRight}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {periodStats.map(s => (
                    <tr key={s.order.id}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{s.order.id}</td>
                      <td style={tdStyle}>{s.client}</td>
                      <td style={tdStyleRight}>{money(s.value)}</td>
                      <td style={tdStyleRight}>{money(s.costs)}</td>
                      <td style={{ ...tdStyleRight, color: profitColor(s.profit) }}>{money(s.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Receivables */}
          <Section title={`Owed to you · as of ${format(new Date(), 'd MMM yyyy')}`}>
            {open.length === 0 ? <Empty text="Nothing outstanding." /> : (
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>Client</th><th style={thStyle}>Invoice</th><th style={thStyle}>Order</th>
                    <th style={thStyle}>Due</th><th style={thStyleRight}>Late</th><th style={thStyleRight}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map(r => (
                    <tr key={r.invoice.id}>
                      <td style={tdStyle}>{r.client}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.invoice.id}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.invoice.order_id}</td>
                      <td style={tdStyle}>{dueOn(r.invoice) || '—'}</td>
                      <td style={tdStyleRight}>{r.daysLate > 0 ? `${r.daysLate}d` : 'not due'}</td>
                      <td style={tdStyleRight}>{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1.5px solid #000', fontWeight: 'bold' }}>
                    <td style={tdStyle} colSpan={5}>Total owed</td>
                    <td style={tdStyleRight}>{money(owed)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '9px', color: '#666' }}>
              {AGING.map(b => (
                <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                  {b.label}
                </span>
              ))}
            </div>
          </Section>

          <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '8px', borderTop: '1px solid #ccc', fontSize: '9px', color: '#888' }}>
            KREASI MAKMUR ABADI — TELP. 021.300.253.99 / Hp. 0811.857.372 — Email : fifi67@yahoo.com
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          #finance-report { width: 100% !important; box-shadow: none !important; }
          @page { size: A4; margin: 12mm; }
          aside { display: none !important; }
          header { display: none !important; }
          .ml-\\[240px\\] { margin-left: 0 !important; }
          nav { display: none !important; }
          table thead { display: table-header-group; } /* repeats on every page */
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontWeight: 'bold', fontSize: '12px', textDecoration: 'underline', marginBottom: '6px' }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>{text}</p>
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '10px' }
const theadRowStyle: React.CSSProperties = { borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }
const thStyle: React.CSSProperties = { padding: '4px 6px', textAlign: 'left' }
const thStyleRight: React.CSSProperties = { padding: '4px 6px', textAlign: 'right' }
const tdStyle: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid #eee' }
const tdStyleRight: React.CSSProperties = { padding: '3px 6px', textAlign: 'right', borderBottom: '1px solid #eee' }
