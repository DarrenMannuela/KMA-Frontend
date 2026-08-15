import { useRef, useLayoutEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Receipt } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp } from '@/components/ui'
import { useRekening } from '@/utils/RekeningStore'

// ─── Multi-page policy ─────────────────────────────────────────────────────
// Previously this page tried to force everything onto a single physical
// sheet: shrink the whole document down via CSS `zoom` until it fit, and if
// it still didn't fit even at the smallest legible font, forcibly push just
// the closing block (signature/copy/footer) onto a manufactured second
// page. That required a fragile JS measurement loop to guess where the real
// print engine would break the page — and every time that guess was wrong
// (screen vs. print rounding differences, async image loads, etc.) it
// produced a visibly broken document: mismatched "Halaman X dari Y" labels,
// or a signature block sliced in half.
//
// Simpler and more robust: let the document paginate NATURALLY, the same
// way any normal printed HTML table does.
//   - The item table is a real <table> with <thead>/<tbody> (see below), so
//     the browser automatically repeats the KETERANGAN/SIZE/QTY/... header
//     row at the top of every page the table spills onto — no JS involved.
//   - `#invoice tr { page-break-inside: avoid }` (see the print <style>
//     block near the bottom) keeps any single row from being sliced in
//     half; the browser just moves that whole row to the next page instead.
//   - The closing block (signature/copy/footer) is wrapped in its own
//     `pageBreakInside: 'avoid'` div, so it's likewise never split — it
//     either continues right after the table on whatever page has room, or
//     moves to the next page as a whole unit if it doesn't.
// A short invoice still lands entirely on one page, exactly as before; a
// long one now spreads across as many pages as it actually needs, with
// proper repeating headers, instead of being crushed to fit or awkwardly
// stranding one small block alone on a second sheet.
const PAGE_HEIGHT_MM = 297
const PAGE_WIDTH_MM = 210
const MM_TO_PX = 96 / 25.4
const PAGE_HEIGHT_PX = PAGE_HEIGHT_MM * MM_TO_PX
// Base font size for the whole sheet, and also the floor: text never
// renders smaller than this. There's deliberately no shrink-to-fit logic
// tied to it — the old system tried to guess a scale factor that would
// squeeze a long invoice onto one physical sheet, which needed a fragile
// JS measurement loop to predict where the real print engine would break
// the page (see the multi-page policy comment above for why that was
// dropped). At a fixed floor, that guessing isn't needed at all: text
// simply never gets smaller than this, and whenever a document has more
// content than one page can hold at that size, the natural table/row flow
// described above just continues it onto as many further pages as it
// takes — the same mechanism that already handles a long item list.
const BASE_FONT_PX = 14

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
  // The D/P row's "paid off" label — only meaningful on a Pelunasan
  // invoice (the D/P really was already received by the time this
  // document is printed), so it's user-typable rather than derived from
  // paid_date: paid_date isn't reliably set/accurate for this purpose,
  // and a free-text field lets it also carry a date or note if wanted.
  // Defaults to "LUNAS" since that's what it almost always ends up saying.
  const dpPaidLabel = useUppercaseField('LUNAS')
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

  // Manual page breaks — keyed by item_name (same key each item group is
  // already grouped/rendered under below), so a break is "start a new page
  // right before this item group" rather than before an individual
  // size-variant row. Scoped to whole groups on purpose: each group already
  // has pageBreakInside:'avoid' on its own <tbody> so its rows are never
  // split apart, and forcing a break in the middle of that same protected
  // unit would just be asking the print engine to satisfy two conflicting
  // instructions at once. A plain Set rather than the rowHighlights pattern
  // above (map to a color) — a break is binary, on or off, nothing to pick.
  const [manualBreaks, setManualBreaks] = useState<Set<string>>(new Set())
  const toggleManualBreak = (name: string) => {
    setManualBreaks(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Purely decorative: a rough, one-shot estimate of whether the document
  // is long enough that the closing block will likely end up starting its
  // own page, used only to decide whether to show the small continuation
  // letterhead in front of it (see the closing block below). This is NOT
  // trying to precisely predict the real print engine's page breaks the
  // way the old shrink-to-fit system did — the actual pagination is left
  // entirely to the browser's natural table/row flow described above.
  // Worst case this guesses wrong and the little context strip shows up
  // when not strictly needed (or doesn't show up once when it would have
  // been nice to have) — low-stakes either way.
  //
  // Deliberately computed straight from `items` rather than measured off
  // the live DOM (getBoundingClientRect inside a dependency-less
  // useLayoutEffect, which this used to be): that measure-then-setState
  // pattern re-fires after every single commit with nothing to stop it,
  // and if the real height ever lands close enough to the threshold that
  // font loading, scrollbar changes, or the hint text's own presence
  // nudges it back and forth across that line, each nudge is itself a
  // state update — a feedback loop that trips React's "Maximum update
  // depth exceeded" (error #185) and blanks the whole page. A plain
  // derived number can't oscillate like that: it's recomputed from
  // `items` on each render, never feeds back into itself, and never
  // needs its own effect or state at all.

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

  // Rough row-based estimate — see the comment above for why this is a
  // plain calculation rather than a DOM measurement. Overhead covers the
  // masthead/customer-detail block, the fixed CATATAN notes, and the
  // signature/footer block, all roughly constant regardless of item
  // count; each item row and each item-group gap row adds its own slice
  // on top of that.
  const groupCount = new Set(items.map(i => i.item_name)).size
  const rowCount = items.length + groupCount /* gap row per group */ + 4 /* company + total + dp + pelunasan rows */
  const approxRowPx = BASE_FONT_PX + 14 /* cell padding */
  const approxOverheadPx = 620 /* masthead + customer detail + notes + signature/footer, roughly */
  const likelyMultiPage = approxOverheadPx + rowCount * approxRowPx > PAGE_HEIGHT_PX * 1.05

  // Same grouping the item table itself builds further down (first
  // appearance order, one entry per distinct item_name) — kept in sync
  // deliberately rather than shared as one computed value, since the
  // table's version also needs each group's actual rows alongside the
  // name, not just the name list this toolbar picker needs.
  const groupNames = [...new Set(items.map(i => i.item_name))]

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
          {likelyMultiPage && ' · long invoice — prints across multiple pages'}
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

      {/* Manual page-break picker — only worth showing once there's more
          than one item group to break between; a single-group invoice has
          nowhere meaningful to put a manual break anyway. Purely a toolbar
          affordance: the actual break is applied down in the item table's
          per-group <tbody>, keyed by the same item_name shown here. */}
      {groupNames.length > 1 && (
        <div className="print:hidden bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 mr-0.5">Start a new page before:</span>
          {groupNames.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => toggleManualBreak(name)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                manualBreaks.has(name)
                  ? 'bg-navy-900 text-white border-navy-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {name}
            </button>
          ))}
          {manualBreaks.size > 0 && (
            <button
              type="button"
              onClick={() => setManualBreaks(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Invoice document */}
      <div className="p-8 print:p-0">
        <div id="invoice-page-wrap" style={{ width: `${PAGE_WIDTH_MM}mm`, position: 'relative' }} className="mx-auto">
          <div
            id="invoice"
            className="bg-white shadow-lg print:shadow-none"
            style={{
              // border-box is essential here: minHeight (297mm) and width
              // (210mm) are meant to describe the OUTER size of the A4
              // sheet. Without border-box, the browser adds the vertical
              // padding (20mm + 15mm) on TOP of minHeight, making the
              // sheet's real minimum height 332mm — already taller than a
              // physical A4 page before a single line of content is drawn,
              // which guaranteed a sliver of overflow onto an almost-empty
              // second page on every invoice, however short.
              boxSizing: 'border-box',
              width: `${PAGE_WIDTH_MM}mm`,
              minHeight: '297mm',
              padding: '20mm 20mm 15mm 20mm',
              fontFamily: 'Arial, sans-serif',
              fontSize: `${BASE_FONT_PX}px`,
              color: '#000',
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
            <table style={{ borderCollapse: 'collapse', fontSize: `${BASE_FONT_PX}px` }}>
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
            <table style={{ borderCollapse: 'collapse', fontSize: `${BASE_FONT_PX}px` }}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: `${BASE_FONT_PX}px` }}>
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
            </tbody>

            {/* Each item group gets its own <tbody> (a table can have as
                many as it needs) instead of one giant shared tbody, purely
                so `pageBreakInside: 'avoid'` can be scoped to it — that
                property only ever protects the single element it's set
                on, so with everything in one tbody there was no way to
                say "keep THIS item's size-variant rows together" without
                also claiming to protect the entire table. Best-effort
                like everything else here: if a single group is too tall
                to fit in what's left of a page at all, the browser still
                has to break it somewhere rather than leave it off the
                page entirely — this just stops an ordinary-sized group
                from splitting when it didn't need to. */}
            {(() => {
              const groups: { name: string; rows: typeof items }[] = []
              items.forEach(item => {
                const group = groups.find(g => g.name === item.item_name)
                if (group) group.rows.push(item)
                else groups.push({ name: item.item_name, rows: [item] })
              })
              return groups.map((group, groupIdx) => (
                <tbody
                  key={group.name}
                  style={{
                    pageBreakInside: 'avoid',
                    // Applied to the whole tbody rather than just its first
                    // row: page-break-before on a <tr> only reliably forces
                    // a break when the browser treats that row as the
                    // start of its own fragmentable unit, which is exactly
                    // what this tbody boundary already establishes above
                    // via pageBreakInside — putting the break on the same
                    // element keeps both rules talking about the same
                    // unit instead of two different ones that could
                    // disagree. Skipped for the very first group: a break
                    // "before" the first item would just be a blank first
                    // page, which was never the intent of picking it in
                    // the toolbar.
                    ...(manualBreaks.has(group.name) && groupIdx > 0
                      ? { pageBreakBefore: 'always', breakBefore: 'page' }
                      : {}),
                  }}
                >
                  {/* Screen-only marker so the break is visible before you
                      ever open the print dialog — print:hidden removes it
                      from the actual output, where the real page boundary
                      speaks for itself. */}
                  {manualBreaks.has(group.name) && groupIdx > 0 && (
                    <tr className="print:hidden">
                      <td colSpan={6} style={{ padding: '2px 0', borderTop: '2px dashed #1a56db' }}>
                        <span style={{ fontSize: '10px', color: '#1a56db', fontWeight: 'bold' }}>
                          — new page starts here —
                        </span>
                      </td>
                    </tr>
                  )}
                  {group.rows.map((item, rowIdx) => {
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
                  })}
                  {/* Gap after every item group — a real visible row (not
                      just a bordered-empty hairline, which collapses to
                      almost nothing with border-collapse when the cell has
                      no content). Plain white by default — the KETERANGAN
                      table's column headers are what's highlighted
                      automatically — but still clickable/paintable like
                      every other row here. */}
                  {(() => {
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
                  })()}
                </tbody>
              ))
            })()}

            {/* TOTAL / D.P / PELUNASAN together in their own tbody, same
                reasoning as the per-item groups above — these three rows
                read as one unit, so a page break landing between e.g.
                TOTAL and PELUNASAN would be far more confusing than one
                between two ordinary item rows. */}
            <tbody style={{ pageBreakInside: 'avoid' }}>
              {/* Total row */}
              <tr
                onClick={() => toggleRowHighlight('total')}
                className="cursor-pointer print:cursor-default"
                style={{ background: rowHighlights['total'] }}
              >
                {/* Blank spacer over NO/KETERANGAN/SIZE. Top border stays —
                    that's the item table's own closing edge (matches every
                    other item row's border, so the grid still reads as
                    "closed" before the totals start). Only the bottom edge
                    is force-suppressed with border-style:'hidden', so no
                    line appears between this spacer and the D/P row's
                    spacer below it — 'hidden' is needed rather than just
                    leaving it unset, since border-collapse otherwise lets a
                    real border set by either neighboring cell win. */}
                <td style={{ padding: '6px 8px', borderTop: '1px solid #ccc', borderBottomStyle: 'hidden' }} colSpan={3} />
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
                  {/* Blank spacer over NO/KETERANGAN/SIZE — same
                      border-style:'hidden' technique as the TOTAL row's
                      spacer above, so no line bleeds through from either
                      neighboring row regardless of their own borders. Only
                      the LUNAS cell next to it should read as a box. */}
                  <td style={{ padding: '6px 8px', borderTopStyle: 'hidden', borderBottomStyle: 'hidden' }} colSpan={3} />
                  {/* Only a Pelunasan invoice is printed after the D/P was
                      actually received, so only it gets a typable "LUNAS"
                      label here — a fresh D/P invoice hasn't been paid yet,
                      so there's nothing to mark. Sized to just the QTY
                      column, same as every other cell in this row. An
                      <input>'s text clips silently against its own box
                      instead of wrapping or forcing the column wider the
                      way a plain <td>'s text would, so at the 60px column
                      width "LUNAS" needs a font a couple sizes under the
                      document's usual floor to comfortably fit — widening
                      the column instead was tried, but that redistributes
                      width across the whole table and nudged the totals
                      block's height just enough to change which page it
                      lands on. This is scoped to only the one input, so
                      it can't affect layout anywhere else. */}
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    {invoice.type === 'pelunasan' && (
                      <input
                        ref={dpPaidLabel.ref}
                        value={dpPaidLabel.value}
                        onChange={dpPaidLabel.onChange}
                        onClick={e => e.stopPropagation()}
                        style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '11px', textAlign: 'right', width: '100%', padding: 0 }}
                      />
                    )}
                  </td>
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
                <td style={{ padding: '6px 8px', textAlign: 'right', borderTopStyle: 'hidden', borderBottomStyle: 'hidden' }} colSpan={3}>
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
          <div style={{ marginTop: '24px', fontSize: `${BASE_FONT_PX}px`, pageBreakInside: 'avoid' }}>
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

          {/* Signature block + Footer are grouped into a single
              page-break-inside:avoid unit so they're never split mid-block.
              Deliberately NOT forcing a page-break before this block —
              that's the whole point of the natural-flow policy above: it
              either continues right after the table/notes on whatever page
              has room, or moves to the next page as a whole unit if it
              doesn't, same as any other row-level content here. Forcing it
              to always start a fresh page wasted the rest of the previous
              page whenever it would have fit fine. */}
          <div style={{ pageBreakInside: 'avoid' }}>
            {/* Signature block */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '24px', fontSize: `${BASE_FONT_PX}px` }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '36px' }}>ASLI INVOICE DI TERIMA OLEH</div>
                <div style={{ borderTop: '1px solid #000', paddingTop: '4px', width: '200px' }} />
                <div>TANDA TANGAN</div>
                <div style={{ marginTop: '4px' }}>NAMA JELAS</div>
                <div>JABATAN</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '36px' }}>DI BUAT OLEH</div>
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

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '8px', borderTop: '1px solid #ccc', fontSize: `${BASE_FONT_PX}px` }}>
              <div>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55 , JAKARTA UTARA 14450</div>
              <div>TELP. 021.300.253.99 / Hp. 0811.857.372</div>
              <div>Email : fifi67@yahoo.com</div>
            </div>
          </div>

          {/* Running per-page footer — a small "invoice no. + client"
              strip pinned to the bottom of every physical page, print-only.
              Chrome (and most print engines) repeat any `position: fixed`
              element once per printed page automatically — this is the one
              reliable way to put real, per-page context on an invoice that
              can now span an unknown number of pages, without needing JS
              to know the actual page count (which isn't obtainable at all
              here — Chrome doesn't expose CSS Paged Media running headers/
              footers or counter(pages) to arbitrary HTML content, only to
              print engines like Prince/WeasyPrint). No exact "Halaman X
              dari Y" anymore for the same reason: with the table itself
              now free to spill across pages, we can no longer know the
              total page count in advance the way the old 1-or-2-page
              system could. */}
          <div
            className="hidden print:block"
            style={{
              position: 'fixed',
              bottom: '8mm',
              left: '20mm',
              right: '20mm',
              fontSize: `${BASE_FONT_PX}px`,
              color: '#94a3b8',
              textAlign: 'right',
            }}
          >
            INVOICE {invoice.id} — {invoice.kepada_yth}
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

          /* @page margin was tried twice here (20mm/20mm/15mm/20mm) as the
             theoretically-correct way to get real per-page insets on every
             physical page, not just the first/last. Both times it printed
             completely edge-to-edge instead — not just failing to add a
             margin, but with #invoice's own padding also stripped out (on
             the assumption @page would supply it), that left literally
             nothing creating any inset on any side. Something in this
             environment's actual PDF/print pipeline isn't honoring @page
             at all — most likely another @page rule elsewhere in the app
             (same-specificity @page rules resolve by whichever the
             pipeline processes last, which may not match plain HTML
             document order the way normal cascade does), or the export
             path isn't running through a real paginated-print engine in
             the first place. Back to the one thing that's actually been
             reliable: a single padding block on #invoice. Left/right stay
             correct on every page no matter how many there are, because
             that padding runs the full height of one continuous box —
             page breaks happening partway down it don't remove it. Top/
             bottom only apply once, at the very start and very end of the
             whole document, so page 2 through second-to-last will still
             start flush at the top and end flush at the bottom — a real
             gap, but a far smaller one than zero margin everywhere, and
             the only one of these two problems solvable without @page
             actually working. */
          @page { size: A4; margin: 0; }

          /* Without this, browsers silently drop background colors when
             printing/exporting to PDF unless the person has manually
             ticked "Background graphics" in the print dialog — so the row
             highlighting (the D/P vs Pelunasan color, the KETERANGAN
             header fill) would print as plain white even though it's
             clearly colored on screen. Force it on regardless of that
             setting. */
          #invoice, #invoice * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* Belt-and-suspenders alongside the pageBreakInside:'avoid' on the
             signature/copy/footer block above: also stop any individual
             table row (an item row, the TOTAL row, the D/P/Pelunasan rows)
             from being sliced in half by a page break on a very long
             invoice. */
          #invoice tr { page-break-inside: avoid; }

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