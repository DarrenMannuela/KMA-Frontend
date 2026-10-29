import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { productionHooks, operationHooks, supplierHooks } from '@/hooks'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { formatRp } from '@/components/ui'
import { fromProduction, fromOperation, inPeriod, supplierLabel, type LedgerRow, type Period } from '@/components/finance/ledgerModel'
import { monthLabel } from '@/utils/MonthUtils'
import { useScaleToFit } from '@/hooks/useScaleToFit'
import { usePrintLightBody } from '@/hooks/usePrintLightBody'

/** "05/KB/26" sorts after "04/KB/26" and after "99/KB/25" — same ordering
 *  Ledger.tsx uses on screen, so the printed sequence matches what the
 *  Kas Bon numbers themselves suggest, not just whatever order the data
 *  happened to load in. */
function kasBonOrder(id: string): number {
  const m = id.match(/^(\d+)\/KB\/(\d+)$/)
  return m ? Number(m[2]) * 100000 + Number(m[1]) : -1
}

/** Prints the on-screen ledger's own shape — Kas Bon by Kas Bon, lines
 *  underneath, a total per Kas Bon — rather than a separate summarized
 *  report: the printed page is meant to read like the existing paper/Excel
 *  Kas Bon sheet this is replacing, "a continuous sheet where a month can
 *  have multiple KBs", not like FinanceReportPrintPage's KPI-driven report.
 *  One Kas Bon's print always includes both its bahan and cost lines
 *  together, regardless of which page (Production or Operations) it was
 *  opened from — that's what the real voucher is, read-only here. */
export function KasBonPrintPage() {
  usePrintLightBody()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const singleId = params.get('id')
  const modeParam = params.get('mode')
  const mode: Period['mode'] = modeParam === 'year' || modeParam === 'range' || modeParam === 'all' ? modeParam : 'month'
  const year = Number(params.get('year')) || new Date().getFullYear()
  const month = Math.min(11, Math.max(0, Number(params.get('month')) || 0))
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  const productionQ = productionHooks.useList()
  const operationsQ = operationHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()
  const queries = [productionQ, operationsQ]

  const allRows = useMemo<LedgerRow[]>(
    () => [...(productionQ.data ?? []).map(fromProduction), ...(operationsQ.data ?? []).map(fromOperation)],
    [productionQ.data, operationsQ.data],
  )

  const period: Period = useMemo(() => ({ mode, year, month, from, to }), [mode, year, month, from, to])

  const scopedRows = useMemo(() => {
    if (singleId) return allRows.filter(r => r.header_id === singleId)
    return allRows.filter(r => inPeriod(r.date, period))
  }, [allRows, singleId, period])

  // Grouped by Kas Bon, in Kas Bon number order; for a year, each Kas Bon
  // also remembers which month it's in, so a divider can mark month
  // boundaries the same way the on-screen yearly view does.
  const groups = useMemo(() => {
    const map = new Map<string, LedgerRow[]>()
    for (const r of scopedRows) map.set(r.header_id, [...(map.get(r.header_id) ?? []), r])
    return [...map.entries()]
      .map(([headerId, rows]) => ({ headerId, rows }))
      .sort((a, b) => kasBonOrder(a.headerId) - kasBonOrder(b.headerId) || a.headerId.localeCompare(b.headerId))
  }, [scopedRows])

  const grandTotal = scopedRows.reduce((n, r) => n + r.total, 0)

  // Keyed the same way as each group's monthKey below, so a month's banner
  // can show the combined total of every Kas Bon that falls inside it, not
  // just its first one.
  const monthTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of scopedRows) {
      const rd = new Date(r.date)
      const key = `${rd.getFullYear()}-${rd.getMonth()}`
      m.set(key, (m.get(key) ?? 0) + r.total)
    }
    return m
  }, [scopedRows])

  const { containerRef: scaleContainerRef, docRef: scaleDocRef, scale, scaledWidth, scaledHeight } = useScaleToFit(true)

  if (queries.some(q => q.isLoading)) return <LoadingState label="Loading the Kas Bon lines…" />
  if (queries.some(q => q.isError)) {
    return <div className="p-4 md:p-6"><div className="card"><ErrorState what="the Kas Bon lines" onRetry={() => queries.forEach(q => q.refetch())} /></div></div>
  }

  const rangeText = `${from ? format(new Date(from), 'd MMM yyyy') : 'the start'} – ${to ? format(new Date(to), 'd MMM yyyy') : 'now'}`
  const title = singleId
    ? `Kas Bon ${singleId}`
    : mode === 'year' ? `${year} Kas Bon`
    : mode === 'range' ? 'Kas Bon'
    : mode === 'all' ? 'All Kas Bon'
    : `${monthLabel(year, month)} Kas Bon`
  const periodText = singleId
    ? (groups[0] ? format(new Date(groups[0].rows[0].date), 'd MMMM yyyy') : '')
    : mode === 'year' ? String(year)
    : mode === 'range' ? rangeText
    : mode === 'all' ? 'All time'
    : monthLabel(year, month)
  const kindLabel = singleId ? 'KAS BON' : mode === 'year' ? 'ANNUAL KAS BON' : mode === 'month' ? 'MONTHLY KAS BON' : 'KAS BON'

  // Spans multiple months outside a single-month view, so a plain divider
  // row marks each month's first Kas Bon the same way the on-screen yearly
  // Ledger does — not just for 'year', but for any scope that can cross a
  // month boundary (a custom date range, or "all time").
  const showsMonths = !singleId && mode !== 'month'
  let lastMonthKey: string | null = null

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">{title}</span>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* The page is a fixed physical width (A4); on a phone or tablet it's
         scaled down to fit here instead of forcing horizontal scroll —
         printing itself always uses the real A4 size (see @media print below). */}
      <div className="p-4 sm:p-8 print:p-0 flex justify-center overflow-x-auto print:overflow-visible" ref={scaleContainerRef}>
        <div className="scale-wrap" style={{ width: scaledWidth || undefined, height: scaledHeight || undefined, overflow: 'hidden' }}>
        <div id="kasbon-report" ref={scaleDocRef} className="bg-white shadow-lg print:shadow-none" style={{ width: '210mm', minHeight: '297mm', padding: '15mm 16mm', fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '11px', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {/* Letterhead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', breakInside: 'avoid' }}>
            <img src="/Logo.png" alt="KMA Logo" style={{ width: '52px', height: 'auto', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '17px', letterSpacing: '0.5px' }}>KREASI MAKMUR ABADI</div>
              <div style={{ fontSize: '10px', color: '#555' }}>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55, JAKARTA UTARA 14450</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{kindLabel}</div>
              <div style={{ fontSize: '12px', color: '#333' }}>{periodText}</div>
              <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Generated {format(new Date(), 'd MMMM yyyy, HH:mm')}</div>
            </div>
          </div>
          <div style={{ borderTop: '2px solid #000', marginBottom: '16px' }} />

          {groups.length === 0 ? (
            <p style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No Kas Bon lines in this period.</p>
          ) : groups.map(({ headerId, rows }) => {
            const first = rows[0]
            const total = rows.reduce((n, r) => n + r.total, 0)
            const d = new Date(first.date)
            const monthKey = showsMonths ? `${d.getFullYear()}-${d.getMonth()}` : null
            const showMonthDivider = monthKey !== null && monthKey !== lastMonthKey
            if (monthKey !== null) lastMonthKey = monthKey
            return (
              <div key={headerId} style={{ breakInside: 'avoid', marginBottom: '14px' }}>
                {showMonthDivider && (
                  <div style={{ textAlign: 'center', background: '#eef2ff', padding: '6px 8px 8px', marginBottom: '12px', breakAfter: 'avoid' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {monthLabel(d.getFullYear(), d.getMonth())}
                    </div>
                    <div style={{ fontSize: '11px', color: '#333', marginTop: '2px' }}>
                      Subtotal&nbsp;&nbsp;<span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatRp(monthTotals.get(monthKey!) ?? 0)}</span>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px' }}>{headerId}</span>
                  <span style={{ fontSize: '10px', color: '#555' }}>{format(new Date(first.date), 'd MMM yyyy')}</span>
                  {first.description && <span style={{ fontSize: '10px', color: '#555' }}>· {first.description}</span>}
                </div>
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRowStyle}>
                      <th style={thStyle}>Item</th>
                      <th style={thStyle}>Supplier / Category</th>
                      <th style={thStyleRight}>Qty</th>
                      <th style={thStyle}>Unit</th>
                      <th style={thStyleRight}>Price</th>
                      <th style={thStyleRight}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.name}</td>
                        <td style={tdStyle}>{r.kind === 'production' ? supplierLabel(suppliers, r.supplier_id) : r.category}</td>
                        <td style={tdStyleRight}>{r.kind === 'production' ? r.qty.toLocaleString('id-ID') : '—'}</td>
                        <td style={tdStyle}>{r.kind === 'production' ? r.unit : '—'}</td>
                        <td style={tdStyleRight}>{formatRp(r.price)}</td>
                        <td style={tdStyleRight}>{formatRp(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1.5px solid #000', fontWeight: 'bold' }}>
                      <td style={tdStyle} colSpan={5}>Total {headerId}</td>
                      <td style={tdStyleRight}>{formatRp(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}

          {groups.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', paddingTop: '8px', borderTop: '2px solid #000', breakInside: 'avoid' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                Grand Total&nbsp;&nbsp;<span style={{ fontFamily: 'monospace' }}>{formatRp(grandTotal)}</span>
              </span>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '8px', borderTop: '1px solid #ccc', fontSize: '9px', color: '#888' }}>
            KREASI MAKMUR ABADI — TELP. 021.300.253.99 / Hp. 0811.857.372 — Email : fifi67@yahoo.com
          </div>
        </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          #kasbon-report { width: 100% !important; margin: 0 !important; transform: none !important; box-shadow: none !important; }
          .scale-wrap { width: auto !important; height: auto !important; overflow: visible !important; }
          @page { size: A4; margin: 12mm; }
          aside { display: none !important; }
          header { display: none !important; }
          .ml-\\[240px\\] { margin-left: 0 !important; }
          nav { display: none !important; }
          table thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '10px' }
const theadRowStyle: React.CSSProperties = { borderTop: '1px solid #999', borderBottom: '1px solid #999' }
const thStyle: React.CSSProperties = { padding: '3px 6px', textAlign: 'left' }
const thStyleRight: React.CSSProperties = { padding: '3px 6px', textAlign: 'right' }
const tdStyle: React.CSSProperties = { padding: '2px 6px', borderBottom: '1px solid #eee' }
const tdStyleRight: React.CSSProperties = { padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #eee' }
