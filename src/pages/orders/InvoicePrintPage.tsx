import { useRef, useLayoutEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Receipt } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp } from '@/components/ui'
import { useRekening } from '@/utils/RekeningStore'

// Page is fit dynamically to one physical page (see the scale effect
// below): shrink everything down together as content grows, but never
// past MIN_SCALE (~9px body text) — beyond that it's no longer legible,
// so we stop shrinking and let the extra content spill onto a second
// printed page instead of being crushed unreadably small.
const PAGE_HEIGHT_MM = 297
const MM_TO_PX = 96 / 25.4
const PAGE_HEIGHT_PX = PAGE_HEIGHT_MM * MM_TO_PX
const BASE_FONT_PX = 11
const MIN_FONT_PX = 9
const MIN_SCALE = MIN_FONT_PX / BASE_FONT_PX

// Preset options for the header-highlight color picker in the toolbar —
// muted, desaturated pastels in the same family as the existing D/P vs
// Pelunasan highlight (#d4e6c3, kept here as "Sage" so it's pickable too)
// rather than bright/saturated colors — reads as understated and
// document-appropriate rather than a bright accent, and stays legible
// under black text either way.
const HIGHLIGHT_PALETTE = [
  { name: 'Sage',      value: '#d4e6c3' },
  { name: 'Dusty Blue', value: '#c3d9e6' },
  { name: 'Wheat',     value: '#e6dcc3' },
  { name: 'Terracotta', value: '#e6c3c3' },
  { name: 'Dusty Rose', value: '#e6c3d9' },
  { name: 'Lavender',  value: '#d9c3e6' },
  { name: 'Muted Teal', value: '#c3e6da' },
  { name: 'Warm Gray', value: '#dcdcd4' },
] as const

function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—'
  return format(new Date(date), 'd-MMM-yy')
}

// Same fix as EditableCell.tsx's caret-jump bug: forcing .toUpperCase()
// on every keystroke re-renders the input with a new string each time,
// which resets the caret to the end unless something restores it — only
// noticeable once you click into the middle of existing text and type.
// Captures the caret position at the moment of each change and restores
// it right after the value updates.
function useUppercaseField(initial: string) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const caretPos = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (ref.current && caretPos.current != null) {
      ref.current.setSelectionRange(caretPos.current, caretPos.current)
    }
  }, [value])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    caretPos.current = e.target.selectionStart
    setValue(e.target.value.toUpperCase())
  }

  return { value, ref, onChange }
}

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')
  const { rekening, setRekening } = useRekening()
  const signatoryName = useUppercaseField('FIFI LESMANA')
  const signatoryTitle = useUppercaseField('FOUNDER')
  const [highlightChoice, setHighlightChoice] = useState<string>(HIGHLIGHT_PALETTE[0].value)
  // Per-row overrides — keyed by a stable id per row (see rowKey below).
  // Clicking a row paints it with whatever color is currently selected in
  // the toolbar's swatch picker; clicking a row that's already that exact
  // color clears it back to its default. The header row's highlight isn't
  // part of this map — it always follows highlightChoice directly, since
  // that one's meant to always be on.
  const [rowHighlights, setRowHighlights] = useState<Record<string, string>>({})
  const toggleRowHighlight = (key: string) => {
    setRowHighlights(prev => {
      const next = { ...prev }
      if (next[key] === highlightChoice) delete next[key]
      else next[key] = highlightChoice
      return next
    })
  }

  // Fit-to-page: contentRef is the actual invoice sheet. We inflate its
  // CSS width by 1/scale before shrinking it back down with
  // transform:scale(scale) — the standard "zoom out to fit" trick, so the
  // whole page (text, spacing, everything) shrinks together instead of
  // just the font, while still rendering edge-to-edge at 210mm rather than
  // leaving a gap on the right. wrapperHeightPx holds the actual space the
  // scaled-down sheet occupies, so the surrounding layout — and print
  // pagination — reflows correctly around it.
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [wrapperHeightPx, setWrapperHeightPx] = useState(PAGE_HEIGHT_PX)
  const convergeAttempts = useRef(0)

  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  })

  const { data: order } = useQuery({
    queryKey: ['order', invoice?.order_id],
    queryFn: () => ordersApi.get(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['items', invoice?.order_id],
    queryFn: () => itemsApi.getByOrder(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  useLayoutEffect(() => {
    convergeAttempts.current = 0
  }, [invoice?.id])

  // Re-measures after every render (deliberately no dependency array) so
  // it reacts to anything that can change content height — item count,
  // notes, the editable bank-account inputs. Each pass compares the
  // natural (pre-transform) height against one page and either converges
  // (change too small to matter) or nudges scale again; capped at a few
  // attempts so it can't oscillate forever if something keeps changing
  // height on every render.
  useLayoutEffect(() => {
    if (!contentRef.current || !invoice) return
    if (convergeAttempts.current > 6) return
    const natural = contentRef.current.scrollHeight
    const needed = PAGE_HEIGHT_PX / natural
    const nextScale = Math.min(1, Math.max(needed, MIN_SCALE))
    const nextWrapperHeight = natural * nextScale
    if (Math.abs(nextScale - scale) > 0.002) {
      convergeAttempts.current += 1
      setScale(nextScale)
    }
    if (Math.abs(nextWrapperHeight - wrapperHeightPx) > 0.5) {
      setWrapperHeightPx(nextWrapperHeight)
    }
  })

  const spillsToSecondPage = scale <= MIN_SCALE + 0.002 && wrapperHeightPx > PAGE_HEIGHT_PX + 1

  if (invoiceLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!invoice) return <div className="p-8 text-red-400">Invoice not found.</div>

  const dpPercent = invoice.total > 0
    ? Math.round(((invoice.down_payment ?? 0) / invoice.total) * 100)
    : 50

  // Previously the Pelunasan row was always highlighted regardless of
  // what this specific invoice document actually represents — a DP
  // invoice would still show Pelunasan in green, which is backwards: the
  // highlighted row should be whichever amount THIS invoice is asking the
  // client to pay right now. A 0% down payment isn't really a "down
  // payment" — same convention as OrderDetailPage/InvoiceListPage — so a
  // dp-type invoice with nothing actually down is treated as a full
  // invoice: no D/P row at all, and the highlight lands on Pelunasan
  // (the full amount) instead of a Rp 0 D/P line.
  const isFullInvoice = invoice.type === 'dp' && (invoice.down_payment ?? 0) === 0
  const highlightDp = invoice.type === 'dp' && !isFullInvoice
  const highlightColor = '#d4e6c3'
  // General-purpose "highlight this cell" background — spread
  // highlightCellStyle into any <td>/<th>'s style object to mark it (e.g.
  // the KETERANGAN table's column headers below). Sourced from
  // highlightChoice (picked in the toolbar's color picker), kept distinct
  // from highlightColor above, which specifically marks whichever of D/P
  // vs Pelunasan is due on THIS invoice — a semantically different kind
  // of highlight that isn't user-pickable.
  const highlightCellStyle = { background: highlightChoice }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">
          {invoice.id}
          {scale < 0.999 && !spillsToSecondPage && ` · fitted to one page (${Math.round(scale * 100)}%)`}
          {spillsToSecondPage && ' · long invoice — prints across 2 pages'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-0.5">Click a row to color it:</span>
          {HIGHLIGHT_PALETTE.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setHighlightChoice(c.value)}
              title={c.name}
              aria-label={c.name}
              className="w-5 h-5 rounded-full shrink-0"
              style={{
                background: c.value,
                border: highlightChoice === c.value ? '2px solid #1e293b' : '1px solid #cbd5e1',
              }}
            />
          ))}
          {Object.keys(rowHighlights).length > 0 && (
            <button
              type="button"
              onClick={() => setRowHighlights({})}
              className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={() => navigate(`/invoice/${encodeURIComponent(invoice.id)}/kwitansi`)}
          className="btn-secondary flex items-center gap-2"
        >
          <Receipt size={14} /> Kwitansi
        </button>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Invoice document */}
      <div className="p-8 print:p-0">
        <div style={{ width: '210mm', height: `${wrapperHeightPx}px` }} className="mx-auto">
          <div
            ref={contentRef}
            id="invoice"
            className="bg-white shadow-lg print:shadow-none"
            style={{
              width: `${100 / scale}%`,
              minHeight: '297mm',
              padding: '20mm 20mm 15mm 20mm',
              fontFamily: 'Arial, sans-serif',
              fontSize: '11px',
              color: '#000',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <img src="/Logo.png" alt="KMA Logo" style={{ width: '80px', height: 'auto', marginBottom: '6px' }} />
              <div style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}>KREASI  MAKMUR  ABADI</div>
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', margin: '20px 0 24px' }}>
            INVOICE
          </div>

          {/* Client + Invoice Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginBottom: '24px' }}>
            {/* Left — client info */}
            <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>KEPADA YTH</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.kepada_yth}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>UNTUK</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.untuk}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', verticalAlign: 'top' }}>ALAMAT</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.alamat}</td>
                </tr>
                {invoice.email && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>Email</td>
                    <td style={{ paddingBottom: '4px', color: '#1a56db' }}>{invoice.email}</td>
                  </tr>
                )}
                {invoice.telp && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px' }}>Telp</td>
                    <td>{invoice.telp}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Right — invoice meta */}
            <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>TANGGAL</td>
                  <td style={{ paddingBottom: '4px' }}>{formatDate(invoice.tanggal)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>INVOICE No.</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>PO No.</td>
                  <td style={{ paddingBottom: '4px' }}>{order?.po_number ?? '—'}</td>
                </tr>
                {invoice.start_produksi && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>START PRODUKSI</td>
                    <td style={{ paddingBottom: '4px' }}>{invoice.start_produksi}</td>
                  </tr>
                )}
                {invoice.lama_produksi && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px' }}>LAMA PRODUKSI</td>
                    <td>{invoice.lama_produksi}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: '11px' }}>
            <thead>
              {/* Column dividers use a darker border (#94a3b8) than the
                  rest of the table (#ccc) — against a light highlight
                  fill, the lighter gray had almost no contrast and the
                  vertical lines between columns basically disappeared. */}
              <tr style={highlightCellStyle}>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: '40px' }}>NO.</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left' }}>KETERANGAN</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: '60px' }}>SIZE</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: '60px' }}>QTY</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: '90px' }}>HARGA NET</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: '100px' }}>JUMLAH (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {/* Company name row — a header/label row, not an item, so it
                  no longer takes a NO. — numbering now belongs entirely to
                  the item groups below it. Clickable like the rows below
                  it, so it can be picked out with a color too. */}
              <tr
                onClick={() => toggleRowHighlight('company')}
                className="cursor-pointer print:cursor-default"
                style={{ background: rowHighlights['company'] }}
              >
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', fontWeight: 'bold', fontStyle: 'italic' }}>
                  {invoice.kepada_yth.toUpperCase()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
              </tr>

              {/* Item rows — grouped by item_name (regardless of the order
                  items actually come back in, so same-named items with
                  different sizes always sit together), numbered 1, 2, 3…
                  with the number only on each group's first row; the
                  size-variant rows underneath it leave NO. blank. */}
              {(() => {
                const groups: { name: string; rows: typeof items }[] = []
                items.forEach(item => {
                  const group = groups.find(g => g.name === item.item_name)
                  if (group) group.rows.push(item)
                  else groups.push({ name: item.item_name, rows: [item] })
                })
                return groups.flatMap((group, groupIdx) => [
                  ...group.rows.map((item, rowIdx) => {
                    const key = `item-${item.id}`
                    return (
                      <tr
                        key={key}
                        onClick={() => toggleRowHighlight(key)}
                        className="cursor-pointer print:cursor-default"
                        style={{ background: rowHighlights[key] }}
                      >
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center' }}>
                          {rowIdx === 0 ? groupIdx + 1 : ''}
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{rowIdx === 0 ? item.item_name.toUpperCase() : ''}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.size ?? '—'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center' }}>{item.amount.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right' }}>{item.price.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right' }}>{item.sub_total.toLocaleString('id-ID')}</td>
                      </tr>
                    )
                  }),
                  // Gap after every item group — a real visible row (not
                  // just a bordered-empty hairline, which collapses to
                  // almost nothing with border-collapse when the cell has
                  // no content). Plain white by default — the KETERANGAN
                  // table's column headers are what's highlighted
                  // automatically — but still clickable/paintable like
                  // every other row here.
                  (() => {
                    const key = `gap-${group.name}`
                    const cellStyle = { border: '1px solid #ccc', padding: '6px 8px', height: '20px', background: rowHighlights[key] }
                    return (
                      <tr key={key} onClick={() => toggleRowHighlight(key)} className="cursor-pointer print:cursor-default">
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                      </tr>
                    )
                  })(),
                ])
              })()}

              {/* Total row */}
              <tr
                onClick={() => toggleRowHighlight('total')}
                className="cursor-pointer print:cursor-default"
                style={{ background: rowHighlights['total'] }}
              >
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} colSpan={3} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                  {items.reduce((s, i) => s + i.amount, 0).toLocaleString('id-ID')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                  {invoice.total.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* DP row — for a full invoice (0% DP) there's no D/P amount
                  to show, but we still render a bordered spacer row in its
                  place (same technique as the Spacer row above TOTAL) so
                  the horizontal rule/spacing above PELUNASAN stays uniform
                  whether or not this particular invoice has a D/P line.
                  Clicking it overrides the automatic highlightDp coloring
                  on its two right-most cells with whichever swatch is
                  selected — click again with the same swatch to go back
                  to the automatic behavior. */}
              {invoice.down_payment != null && invoice.down_payment > 0 ? (
                <tr onClick={() => toggleRowHighlight('dp')} className="cursor-pointer print:cursor-default">
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderTop: '1px solid #ccc' }} colSpan={3}>
                    {/* "LUNAS" (paid off) should reflect paid_date, not
                        due_date — this previously read due_date, which
                        would print a due date next to a "paid" label.
                        PLEASE VERIFY against a real printed kwitansi
                        before relying on this. */}
                    {invoice.paid_date ? `LUNAS - ${format(new Date(invoice.paid_date), 'd MMMM yyyy').toUpperCase()}` : 'LUNAS'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    D/P {dpPercent} %
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    {(invoice.down_payment ?? 0).toLocaleString('id-ID')}
                  </td>
                </tr>
              ) : (
                <tr onClick={() => toggleRowHighlight('dp')} className="cursor-pointer print:cursor-default">
                  {(() => {
                    const cellStyle = { border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] }
                    return (
                      <>
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                        <td style={cellStyle} />
                      </>
                    )
                  })()}
                </tr>
              )}

              {/* Pelunasan row — same click-to-override behavior as DP above. */}
              <tr onClick={() => toggleRowHighlight('pelunasan')} className="cursor-pointer print:cursor-default">
                <td style={{ padding: '6px 8px', textAlign: 'right' }} colSpan={3}>
                  {/* Same fix as the D/P row above: "LUNAS" → paid_date,
                      "J/T" (jatuh tempo = due date) → due_date. Both were
                      previously reading the other field. PLEASE VERIFY
                      against a real printed kwitansi before relying on
                      this. */}
                  {isFullInvoice
                    ? (invoice.paid_date ? `LUNAS - ${format(new Date(invoice.paid_date), 'd MMMM yyyy').toUpperCase()}` : 'LUNAS')
                    : (invoice.due_date ? `J/T : ${format(new Date(invoice.due_date), 'd MMMM yyyy').toUpperCase()}` : '')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  PELUNASAN
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  {invoice.remaining.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          <div style={{ marginTop: '24px', fontSize: '11px' }}>
            <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '4px' }}>CATATAN :</div>
            <ol style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
              <li>Barang akan di proses setelah mock up sudah di ACC dan saat D/P 50% sudah masuk</li>
              <li>Barang akan di kirim sesuai PO</li>
              <li>Saat pengiriman  barang harus membawa PO</li>
              <li>Pembayaran 1 minggu saat pelunasan</li>
              <li>Tanggal Pengiriman : 2 - 3 minggu hari kerja setelah di terima D/P</li>
              <li>Pembayaran via transfer ke rekening a/n :<br />
                &nbsp;&nbsp;&nbsp;&nbsp;<input
                  value={rekening.accountName}
                  onChange={e => setRekening({ accountName: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', width: '220px', padding: 0 }}
                /><br />
                &nbsp;&nbsp;&nbsp;&nbsp;<input
                  value={rekening.bankBranch}
                  onChange={e => setRekening({ bankBranch: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', width: '220px', padding: 0 }}
                /><br />
                &nbsp;&nbsp;&nbsp;&nbsp;No Rek. <input
                  value={rekening.accountNumber}
                  onChange={e => setRekening({ accountNumber: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 'bold', width: '160px', padding: 0 }}
                />
              </li>
            </ol>
          </div>

          {/* Signature block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', fontSize: '11px' }}>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '60px' }}>ASLI INVOICE DI TERIMA OLEH</div>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', width: '200px' }} />
              <div>TANDA TANGAN</div>
              <div style={{ marginTop: '4px' }}>NAMA JELAS</div>
              <div>JABATAN</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '60px' }}>DI BUAT OLEH</div>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', display: 'inline-block', width: '200px' }} />
              <div>
                <input
                  ref={signatoryName.ref}
                  value={signatoryName.value}
                  onChange={signatoryName.onChange}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', textAlign: 'right', width: '200px', padding: 0 }}
                />
              </div>
              <div>
                <input
                  ref={signatoryTitle.ref}
                  value={signatoryTitle.value}
                  onChange={signatoryTitle.onChange}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', textAlign: 'right', width: '200px', padding: 0 }}
                />
              </div>
              <div style={{ fontWeight: 'bold' }}>KREASI MAKMUR ABADI</div>
            </div>
          </div>

          {/* Copy labels */}
          <div style={{ marginTop: '24px', fontSize: '10px' }}>
            {[['Asli', 'Client'], ['Copy 1', 'KMA'], ['Copy 2', 'Produksi KMA']].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '60px 12px 1fr', marginBottom: '2px' }}>
                <span style={{ color: '#c0392b' }}>{label}</span>
                <span>:</span>
                <span style={{ color: '#1a56db' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '10px' }}>
            <div>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55 , JAKARTA UTARA 14450</div>
            <div>TELP. 021.300.253.99 / Hp. 0811.857.372</div>
            <div>Email : fifi67@yahoo.com</div>
          </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          @page { size: A4; margin: 0; }
          
          /* ← Add these to hide sidebar and topbar when printing */
          aside { display: none !important; }
          header { display: none !important; }
          .ml-\\[240px\\] { margin-left: 0 !important; }
          nav { display: none !important; }
        }
      `}</style>
    </div>
  )
}