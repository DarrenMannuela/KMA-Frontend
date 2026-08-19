import { useRef, useLayoutEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Receipt, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp } from '@/components/ui'
import { useRekening } from '@/utils/RekeningStore'
import { itemHooks } from '@/hooks'
import { useColumnWidths, setColumnWidth, setColumnWidths, resetColumnWidths, type ColumnKey } from '@/utils/ColumnnWidthStore'
import { usePaperFormat, PAPER_FORMATS, type PaperFormat } from '@/utils/PaperFormatStore'
import type { Invoice, Item, Order } from '@/types'

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
const MM_TO_PX = 96 / 25.4
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
// Escapes a runtime string for safe use inside a CSS `content: "..."` value
// — used below to drop invoice.id/invoice.kepada_yth into the @page
// footer's margin-box content. Without this, a stray literal `"` in either
// field (unlikely but not impossible — a client name, say) would terminate
// the CSS string early and corrupt the rest of the stylesheet.
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const BASE_FONT_PX = 14
// Reserved strictly for the print-only running footer added below (page
// number + invoice/client context) — carved out of the EXISTING bottom
// padding rather than added on top of it, so the physical page size and
// on-screen preview are both untouched; only the print-time split between
// "#invoice's own padding" and "true @page margin" changes. See the @page
// rule's own comment near the bottom of this file for why only the bottom
// side moves, and why that's a deliberately smaller, more isolated attempt
// at @page margin than the two that already failed here before.
const FOOTER_MARGIN_MM = 14

// ─── Column auto-fit ───────────────────────────────────────────────────────
// Replaces dragging a column border to a guessed pixel width. A drag has no
// "just right" — it's exactly how the NO. column ended up too narrow to
// show anything but "N…" in the first place, with no easy way back short of
// resetting every column to its default. Auto-fit sizes a column directly
// from what's actually printed in it, measured with a canvas 2d context
// using the same font the table itself renders with. A live DOM measurement
// of the real <th>/<td> elements was the other option, but that needs the
// table taken out of table-layout:'fixed' (which fixed layout depends on to
// keep a set width authoritative — see the table's own comment below) and a
// render/paint cycle to read the result back; canvas measureText gives an
// exact width synchronously without touching the table at all.
let measureCanvas: HTMLCanvasElement | null = null
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return 0
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}
// Always the bold weight, not each cell's actual one — SIZE, and the
// TOTAL/D-P/PELUNASAN labels sharing the HARGA NET/JUMLAH columns, render
// bold while ordinary item numbers don't. Measuring everything at the
// heavier weight means the fitted width is never a hair too narrow for
// whichever cell in that column IS bold — overshooting a plain-weight cell
// by a couple px is invisible; undershooting a bold one clips it.
const AUTOFIT_FONT = `bold ${BASE_FONT_PX}px Arial`
// Matches each <th>/<td>'s own padding (6px 8px → 8px each side) plus a
// bit more slack than a plain sub-pixel-rounding buffer would need — the
// QTY column also holds an <input> (the Pelunasan row's "LUNAS" field),
// and an <input> clips its own text at its box edge no matter what the
// surrounding <td> allows, so undershooting there doesn't overflow
// visibly the way a plain cell now does — it just silently clips again.
// Worth a few extra px everywhere for that one column's sake.
const AUTOFIT_PADDING = 8 + 8 + 6

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

  // Exposed alongside the caret-preserving onChange above so a caller can
  // still reset the field programmatically (e.g. clearing the add-item
  // form after a successful submit) without needing its own separate
  // piece of state duplicating what this hook already tracks.
  return { value, ref, onChange, setValue }
}

// A thin strip laid over a <th>'s right edge (the <th> needs
// position:'relative' for this to align correctly) that auto-fits that one
// column on click — see the "Column auto-fit" comment above for why this
// replaced dragging. A visible tick mark (styled in the stylesheet at the
// bottom of this file, via the column-autofit-handle class) sits on the
// border so it actually reads as clickable, rather than being a fully
// invisible hit target that only a hover tooltip explained — that was the
// whole handle before, and it made auto-fit undiscoverable. print:hidden —
// a handle to interact with on screen has no meaning once the page is
// actually printed, only the width it already set does.
function ColumnAutoFitHandle({ onAutoFit }: { onAutoFit: () => void }) {
  return (
    <div
      onClick={e => {
        e.stopPropagation()
        onAutoFit()
      }}
      className="print:hidden column-autofit-handle"
      title="Click to auto-fit this column to its content"
      style={{
        position: 'absolute',
        top: 0,
        right: '-6px',
        width: '12px',
        height: '100%',
        cursor: 'pointer',
        zIndex: 5,
      }}
    />
  )
}

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')
  const { rekening, setRekening } = useRekening()
  const columnWidths = useColumnWidths()
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

  // Per-invoice, not global — see PaperFormatStore's own comment for why
  // this isn't a shared preference the way column widths are.
  const [paperFormat, setPaperFormat] = usePaperFormat(invoice?.id)
  const { widthMm: pageWidthMm, heightMm: pageHeightMm } = PAPER_FORMATS[paperFormat]
  const pageHeightPx = pageHeightMm * MM_TO_PX

  const { data: order } = useQuery({
    queryKey: ['order', invoice?.order_id],
    queryFn: () => ordersApi.get(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  const { data: items = [], refetch: refetchItems } = useQuery({
    queryKey: ['items', invoice?.order_id],
    queryFn: () => itemsApi.getByOrder(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  // Adding a row here creates a REAL item on this order — same mutation
  // ItemsPage's own form uses — rather than a document-only line, so it
  // shows up consistently everywhere else the order's items are listed
  // (ItemsPage, OrderDetailPage) too. Deliberately not reusing
  // OrderDetailPage/ItemsPage's own ItemForm component here: this is a
  // quick one-line add for someone already looking at the printed
  // invoice, not the full editing surface, so it only needs enough fields
  // to create a minimally valid item — Order is implicit (this invoice's
  // order), and nothing here supports editing an item after the fact
  // (already covered by the real ItemsPage).
  const createItem = itemHooks.useCreate()
  const newItemName = useUppercaseField('')
  const newItemSize = useUppercaseField('')
  const [newItemAmount, setNewItemAmount] = useState(1)
  const [newItemPrice, setNewItemPrice] = useState(0)

  const handleAddItem = () => {
    if (!invoice || !newItemName.value.trim()) return
    createItem.mutate(
      {
        order_id: invoice.order_id,
        item_name: newItemName.value.trim(),
        size: newItemSize.value.trim(),
        amount: newItemAmount,
        price: newItemPrice,
        sub_total: newItemAmount * newItemPrice,
      },
      {
        onSuccess: () => {
          // itemHooks.useCreate() almost certainly already invalidates
          // whatever query key ItemsPage's own list uses, and React
          // Query's default invalidation matches by key PREFIX — so if
          // that key is the plain ['items'] this codebase's other list
          // hooks (orderHooks, invoiceHooks) already follow, it would
          // catch this page's own ['items', order_id] query for free.
          // Called explicitly anyway rather than assumed: this page's
          // query key includes the order_id, a shape nothing else in the
          // codebase happens to share, so there's no way to confirm that
          // prefix match holds without seeing inside '@/hooks' itself —
          // an explicit refetch costs nothing extra if it was already
          // covered, but guarantees the new row actually appears here if
          // it wasn't.
          refetchItems()
          newItemName.setValue('')
          newItemSize.setValue('')
          setNewItemAmount(1)
          setNewItemPrice(0)
        },
      }
    )
  }

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
  const likelyMultiPage = approxOverheadPx + rowCount * approxRowPx > pageHeightPx * 1.05

  // Single source of truth for item grouping — the table further down and
  // the page-segmentation below both read from this same array, instead of
  // each recomputing their own (which is how the on-screen break marker
  // and the actual table used to drift out of sync).
  const groups: { name: string; rows: typeof items }[] = []
  items.forEach(item => {
    const g = groups.find(g => g.name === item.item_name)
    if (g) g.rows.push(item)
    else groups.push({ name: item.item_name, rows: [item] })
  })
  const groupNames = groups.map(g => g.name)

  // Splits `groups` into page segments at every manual break — this is
  // KNOWN synchronously from state (the user clicked a toggle), unlike a
  // natural overflow break, which is why it's safe to act on directly here
  // rather than needing the measure-after-render approach that caused the
  // "Maximum update depth exceeded" bug described above.
  //
  // Deliberately NOT used to split the item table into separate DOM
  // elements per page — the table stays one continuous flow, same as
  // before (see the multi-page policy comment at the top of the file for
  // why: only the browser's own natural table/row pagination can account
  // for content this component can't measure, like a natural overflow
  // break landing partway through a segment). What this DOES drive is the
  // on-screen break marker at each manual break — instead of a thin
  // dashed rule, it now reads as a real page edge with an accurate "Page N
  // → Page N+1" label, using the segment number computed here.
  const pageSegments: { groups: typeof groups }[] = []
  const groupPageNumber = new Map<string, number>()
  groups.forEach((g, i) => {
    if (i > 0 && manualBreaks.has(g.name)) pageSegments.push({ groups: [g] })
    else if (pageSegments.length === 0) pageSegments.push({ groups: [g] })
    else pageSegments[pageSegments.length - 1].groups.push(g)
    groupPageNumber.set(g.name, pageSegments.length)
  })
  if (pageSegments.length === 0) pageSegments.push({ groups: [] })

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

  // What's actually rendered in each fixed-width column right now — the
  // source auto-fit measures against. Built here (rather than inside the
  // handlers below) so both the per-column click handler and the
  // "auto-fit all" toolbar button read from the exact same list; every
  // string here should have a matching cell somewhere in the table below.
  // KETERANGAN has no entry — it's the one column with no stored width to
  // fit in the first place (see ColumnWidthsStore's comment on ColumnKey).
  const hasDp = invoice.down_payment != null && invoice.down_payment > 0
  const columnTexts: Record<ColumnKey, string[]> = {
    no: ['NO.', ...groups.map((_, i) => String(i + 1))],
    size: ['SIZE', ...items.map(i => i.size || '—')],
    qty: [
      'QTY',
      ...items.map(i => i.amount.toLocaleString('id-ID')),
      items.reduce((s, i) => s + i.amount, 0).toLocaleString('id-ID'),
      ...(invoice.type === 'pelunasan' ? [dpPaidLabel.value] : []),
    ],
    hargaNet: [
      'HARGA NET',
      ...items.map(i => i.price.toLocaleString('id-ID')),
      'TOTAL',
      ...(hasDp ? [`D/P ${dpPercent} %`] : []),
      'PELUNASAN',
    ],
    jumlah: [
      'JUMLAH (Rp)',
      ...items.map(i => i.sub_total.toLocaleString('id-ID')),
      invoice.total.toLocaleString('id-ID'),
      ...(hasDp ? [(invoice.down_payment ?? 0).toLocaleString('id-ID')] : []),
      invoice.remaining.toLocaleString('id-ID'),
    ],
  }
  const fitWidthFor = (column: ColumnKey) =>
    columnTexts[column].reduce((max, t) => Math.max(max, measureTextWidth(t, AUTOFIT_FONT)), 0) + AUTOFIT_PADDING
  const autoFitColumn = (column: ColumnKey) => setColumnWidth(column, fitWidthFor(column))
  const autoFitAllColumns = () => {
    const next: Partial<Record<ColumnKey, number>> = {}
    ;(Object.keys(columnTexts) as ColumnKey[]).forEach(column => {
      next[column] = fitWidthFor(column)
    })
    setColumnWidths(next)
  }

  // Plain native print — see the multi-page policy comment at the top of
  // this file. The browser handles table pagination and repeated headers
  // on its own; the one thing it can't do is bake a real "Page X / Y"
  // into each sheet (see the running per-page footer's own comment below
  // for why that's a fair trade).
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        {/* Always the invoice list, not navigate(-1) — this page is
            commonly reached cold (a typed URL, a reopened tab, a
            bookmark), where there's no useful in-app history to go back
            to; navigate(-1) in that case either does nothing or leaves
            the app entirely. Always landing on /invoice is simple and
            predictable either way, at the cost of not returning to
            wherever "Print" was actually clicked from (e.g. a specific
            order) when there IS real history. */}
        <button
          onClick={() => navigate('/invoice')}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1 flex items-center gap-1.5">
          {invoice.id}
          {/* There's no way to know the real page count ahead of the
              browser's own native print layout (see the multi-page policy
              comment at the top of this file) — this is just the floor we
              DO know for certain: at least one sheet per manual page-break
              segment, plus the rough row-based heuristic further up.
              Natural overflow could still add more than that, which is
              why it's phrased as "at least". */}
          {pageSegments.length > 1 || likelyMultiPage ? (
            <span className="badge bg-slate-100 text-slate-600">
              at least {pageSegments.length} page{pageSegments.length === 1 ? '' : 's'}
            </span>
          ) : null}
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
        {/* Per-invoice, persisted via PaperFormatStore — see its own
            comment for why this is keyed by invoice id rather than shared
            globally the way column widths are. Drives both the actual
            @page size for real printing and #invoice's own on-screen
            dimensions below, so switching it changes what you're looking
            at immediately, not just what eventually gets printed. */}
        <select
          value={paperFormat}
          onChange={e => setPaperFormat(e.target.value as PaperFormat)}
          className="field text-sm !w-auto"
          title="Paper format"
        >
          {(Object.keys(PAPER_FORMATS) as PaperFormat[]).map(key => (
            <option key={key} value={key}>{PAPER_FORMATS[key].label}</option>
          ))}
        </select>
        <button
          onClick={() => navigate(`/invoice/${encodeURIComponent(invoice.id)}/kwitansi`)}
          className="btn-secondary flex items-center gap-2"
        >
          <Receipt size={14} /> Kwitansi
        </button>
        <button
          onClick={handlePrint}
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

      {/* Column widths — each fixed-width column (NO/SIZE/QTY/HARGA NET/
          JUMLAH) can be auto-fit individually by clicking its right edge
          in the header (see ColumnAutoFitHandle), or all at once here.
          "Reset to default" stays alongside it as a separate action: fit
          sizes to THIS invoice's actual content, which is exactly what you
          don't want if a later, differently-sized invoice inherits it (the
          widths are shared across every invoice — see ColumnWidthsStore) —
          reset is the way back to the fixed starting point. */}
      <div className="print:hidden bg-white border-b border-slate-200 px-6 py-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={autoFitAllColumns}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Auto-fit all columns
        </button>
        <button
          type="button"
          onClick={() => resetColumnWidths()}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Reset column widths to default
        </button>
      </div>

      {/* Invoice document */}
      <div className="p-8 print:p-0">
        <div id="invoice-page-wrap" style={{ width: `${pageWidthMm}mm`, position: 'relative' }} className="mx-auto">
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
              //
              // This padding (and minHeight) is the screen/on-screen-preview
              // value only — print gets a shorter bottom padding and
              // minHeight, via the #invoice override inside @media print
              // near the bottom of this file, to make room for the running
              // footer's real @page margin box. Left as the full 15mm here
              // so the on-screen preview isn't misleadingly shorter than
              // the actual printed page.
              boxSizing: 'border-box',
              width: `${pageWidthMm}mm`,
              minHeight: `${pageHeightMm}mm`,
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
          {/* table-layout:'fixed' rather than the default 'auto': with
              auto layout, an explicit <th> width is only ever a hint —
              the browser still grows a column to fit its widest cell
              content, which would make dragging a column narrower mostly
              not work (the numbers/labels inside would just keep forcing
              it back open). Fixed layout makes the <th> widths below
              authoritative, so a resize actually takes effect; any
              content too wide for its new column just wraps, the same
              way LAMA PRODUKSI already wraps in the table above. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: `${BASE_FONT_PX}px`, tableLayout: 'fixed' }}>
            <thead>
              {/* Column dividers use a darker border (#94a3b8) than the
                  rest of the table (#ccc) — against a light highlight
                  fill, the lighter gray had almost no contrast and the
                  vertical lines between columns basically disappeared. */}
              <tr style={highlightCellStyle}>
                <th style={{ position: 'relative', border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.no}px`, whiteSpace: 'nowrap' }}>
                  NO.
                  <ColumnAutoFitHandle onAutoFit={() => autoFitColumn('no')} />
                </th>
                {/* No auto-fit handle here — KETERANGAN is the one column
                    that's meant to stay flexible and absorb whatever
                    width the other five don't use (see
                    ColumnWidthsStore's comment on ColumnKey), so it
                    intentionally has no stored/explicit width to fit.
                    Also the one header left free to wrap onto multiple
                    lines rather than nowrap like the rest — it's a single
                    word ("KETERANGAN") so wrapping was never the actual
                    problem here, and this column is exactly the one place
                    text SHOULD be allowed to wrap (long item names), not
                    get clipped. */}
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left' }}>KETERANGAN</th>
                <th style={{ position: 'relative', border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.size}px`, whiteSpace: 'nowrap' }}>
                  SIZE
                  <ColumnAutoFitHandle onAutoFit={() => autoFitColumn('size')} />
                </th>
                <th style={{ position: 'relative', border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.qty}px`, whiteSpace: 'nowrap' }}>
                  QTY
                  <ColumnAutoFitHandle onAutoFit={() => autoFitColumn('qty')} />
                </th>
                {/* hargaNet/jumlah: DEFAULT_COLUMN_WIDTHS (105/120) is
                    sized so "HARGA NET"/"JUMLAH (Rp)" fit on one line at
                    the default width. No overflow-hidden/ellipsis safety
                    net anymore — that was masking exactly the problem it
                    was meant to guard against (a column dragged too
                    narrow silently clipped down to "N…" instead of
                    showing something was wrong). Auto-fit is what keeps
                    these columns wide enough for their content now; if a
                    column somehow still ends up narrower than its text,
                    that text visibly overflows instead of disappearing. */}
                <th style={{ position: 'relative', border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.hargaNet}px`, whiteSpace: 'nowrap' }}>
                  HARGA NET
                  <ColumnAutoFitHandle onAutoFit={() => autoFitColumn('hargaNet')} />
                </th>
                <th style={{ position: 'relative', border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.jumlah}px`, whiteSpace: 'nowrap' }}>
                  JUMLAH (Rp)
                  <ColumnAutoFitHandle onAutoFit={() => autoFitColumn('jumlah')} />
                </th>
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
            {groups.map((group, groupIdx) => {
              // Only a manual break is actually known synchronously from
              // state — see the pageSegments comment above for why a
              // natural overflow break can't be predicted here without
              // the browser's own real print layout, which this
              // component has no way to inspect ahead of time.
              const manualBreakHere = manualBreaks.has(group.name) && groupIdx > 0
              const showBreakMarker = manualBreakHere
              const endOfPageLabel = groupPageNumber.get(group.name)! - 1
              const startOfPageLabel = groupPageNumber.get(group.name)
              // Whether THIS group is the last one on its page — i.e. the
              // NEXT group carries a manual break, so this page may end
              // with blank space below it rather than running naturally
              // into more content. Needed so a "continued on next page"
              // note can be printed at the bottom of the page that's
              // ending, not just a "continued from previous page" note at
              // the top of the one starting — a client reading only the
              // finished PDF has no way to tell "this page ended on
              // purpose, more follows" from "this is the last page"
              // without something printed on the page itself; the
              // screen-only marker above never reaches them.
              const nextGroup = groups[groupIdx + 1]
              const endsPageHere = !!nextGroup && manualBreaks.has(nextGroup.name)

              return (
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
                    ...(manualBreakHere
                      ? { pageBreakBefore: 'always', breakBefore: 'page' }
                      : {}),
                  }}
                >
                  {/* Screen-only marker so the break is visible before you
                      ever open the print dialog — print:hidden removes it
                      from the actual output, where the real page boundary
                      speaks for itself there instead. Deliberately styled
                      to actually LOOK like a page edge (a paper-colored gap
                      with shadowed top/bottom edges and real "Page N" /
                      "Page N+1" labels) rather than a thin dashed rule —
                      the rule technically marked the same spot but read as
                      an annotation, not as what will actually happen to
                      the document. Only shown at a manual break — a
                      natural overflow break is entirely up to the browser's
                      own print layout and can't be known ahead of time
                      (see the multi-page policy comment at the top of this
                      file). */}
                  {showBreakMarker && (
                    <tr className="print:hidden">
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div style={{ margin: '10px -20mm', padding: '0 20mm' }}>
                          {/* Bottom edge of the page that just ended */}
                          <div style={{ height: '10px', background: 'linear-gradient(#fff, #f8fafc)', boxShadow: '0 2px 4px rgba(15,23,42,0.12)' }} />
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            padding: '10px 0', background: '#e2e8f0',
                          }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}>
                              END OF PAGE {endOfPageLabel}
                            </span>
                            <span style={{ width: '1px', height: '12px', background: '#94a3b8' }} />
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155' }}>
                              PAGE {startOfPageLabel} STARTS BELOW
                            </span>
                          </div>
                          {/* Top edge of the page that's about to start */}
                          <div style={{ height: '10px', background: 'linear-gradient(#f8fafc, #fff)', boxShadow: '0 -2px 4px rgba(15,23,42,0.12)' }} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* The client-facing counterpart to the admin marker
                      above — hidden on screen (redundant there, since the
                      big colored marker already says the same thing to
                      whoever set the break) and shown ONLY in print via
                      the .continuation-note override in the print
                      stylesheet near the bottom of this file. Deliberately
                      doesn't reuse "PAGE {startOfPageLabel}" wording: that
                      number comes from pageSegments, which only counts
                      manual breaks and can silently fall behind the real
                      printed page number the moment natural overflow adds
                      an unplanned page earlier in the document — printing
                      a wrong page number would be worse than printing
                      none. Plain "continued from previous page" makes the
                      same promise to the client without claiming a count
                      this component can't actually guarantee. */}
                  {manualBreakHere && (
                    <tr className="continuation-note">
                      <td colSpan={6} style={{ padding: '0 8px 10px', textAlign: 'left', fontSize: '10px', fontStyle: 'italic', color: '#64748b', border: 'none' }}>
                        (continued from previous page)
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
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {rowIdx === 0 ? groupIdx + 1 : ''}
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{rowIdx === 0 ? item.item_name.toUpperCase() : ''}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.size ?? '—'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{item.amount.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.price.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.sub_total.toLocaleString('id-ID')}</td>
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
                  {/* Prints at the bottom of the page that's about to end —
                      the other half of the "continued from previous page"
                      note above. Without this, any blank space below the
                      last item on this page (which can be most of the
                      sheet, if the break was placed right after a short
                      group) looks like the invoice just stopped rather
                      than continuing, which is exactly the confusion this
                      was asked to fix. Hidden on screen for the same
                      reason as its counterpart above — the admin marker
                      already covers this for whoever's placing the break;
                      this copy is only for the printed page itself. */}
                  {endsPageHere && (
                    <tr className="continuation-note">
                      <td colSpan={6} style={{ padding: '10px 8px 0', textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', border: 'none' }}>
                        (continued on next page)
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}

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
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  {items.reduce((s, i) => s + i.amount, 0).toLocaleString('id-ID')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>TOTAL</td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
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
                      column, same as every other cell in this row. Now
                      matches PELUNASAN's own size/weight (14px bold) —
                      previously shrunk to 11px because the QTY column's
                      fixed 60px width couldn't fit "LUNAS" at full size,
                      but auto-fit already measures this exact input's text
                      at that same bold size when sizing the QTY column
                      (see columnTexts.qty above), so the column itself
                      grows to fit it instead of the text needing to shrink. */}
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    {invoice.type === 'pelunasan' && (
                      <input
                        ref={dpPaidLabel.ref}
                        value={dpPaidLabel.value}
                        onChange={dpPaidLabel.onChange}
                        onClick={e => e.stopPropagation()}
                        style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: `${BASE_FONT_PX}px`, fontWeight: 'bold', textAlign: 'right', width: '100%', padding: 0 }}
                      />
                    )}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    D/P {dpPercent} %
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
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
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  PELUNASAN
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  {invoice.remaining.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Add-item panel — print:hidden, and deliberately placed
              directly under the table it adds to rather than up in the
              toolbar, so it's obvious which table a new row lands in.
              Only item name is required; size/qty/price default to blank/
              1/0 the same way a fresh row in ItemsPage's own form would,
              since a placeholder line is still often useful even before
              every field is filled in. */}
          <div className="print:hidden" style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap', background: '#f8fafc', borderRadius: '6px', padding: '10px 12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Item Name</label>
              <input
                ref={newItemName.ref}
                value={newItemName.value}
                onChange={newItemName.onChange}
                placeholder="e.g. APRON"
                className="field"
                style={{ width: '180px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Size</label>
              <input
                ref={newItemSize.ref}
                value={newItemSize.value}
                onChange={newItemSize.onChange}
                placeholder="M"
                className="field"
                style={{ width: '70px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Qty</label>
              <input
                type="text"
                inputMode="numeric"
                value={newItemAmount || ''}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '')
                  setNewItemAmount(digits === '' ? 0 : Math.trunc(Number(digits)))
                }}
                className="field"
                style={{ width: '70px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Unit Price (Rp)</label>
              <input
                type="text"
                inputMode="numeric"
                value={newItemPrice || ''}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '')
                  setNewItemPrice(digits === '' ? 0 : Math.trunc(Number(digits)))
                }}
                className="field font-mono"
                style={{ width: '110px' }}
              />
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={createItem.isPending || !newItemName.value.trim()}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus size={14} /> {createItem.isPending ? 'Adding…' : 'Add Row'}
            </button>
          </div>

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

          {/* The running per-page footer (page number + invoice/client
              context) used to live here as a `position: fixed` HTML div —
              see the @page rule's own comment near the bottom of this file
              for why it moved into real @page margin boxes instead, and
              what that does and doesn't fix. */}
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        /* Auto-fit column handle — a thin, mostly-invisible click target
           sitting on each resizable header's right border (see
           ColumnAutoFitHandle). On-screen only (buried in @media print
           below is where it actually gets hidden for real printing); the
           ::after tick is what makes it discoverable at all — a plain
           invisible strip with only a title-attribute tooltip turned out
           to look exactly like "nothing is there", which is why clicking
           to resize was hard to find in the first place. The tick sits
           dead center on the column border so it reads as belonging to
           that border, and brightens/thickens on hover so hovering near
           the edge actually confirms something is clickable before you
           click it. */
        .column-autofit-handle { position: relative; }
        .column-autofit-handle::after {
          content: '';
          position: absolute;
          top: 15%;
          bottom: 15%;
          left: 50%;
          width: 2px;
          background: rgba(148, 163, 184, 0.6);
          transform: translateX(-50%);
          border-radius: 1px;
        }
        .column-autofit-handle:hover::after {
          background: #2563eb;
          width: 3px;
        }

        /* Off by default — these are the print-only "(continued on next
           page)" / "(continued from previous page)" rows, meant purely
           for whoever ends up holding the printed/PDF pages (see the two
           .continuation-note rows in the item table above). They'd be
           redundant clutter on screen, where the big colored admin marker
           already says the same thing to whoever's placing the break;
           this plain-text copy only needs to exist for print. Turned back
           on inside @media print below, the same on/off-then-flip pattern
           already used for .print\\:hidden but inverted, since this is
           print-only rather than screen-only. */
        .continuation-note { display: none; }

        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .continuation-note { display: table-row !important; }

          {/* @page margin was tried twice here before (20mm/20mm/15mm/20mm,
             all four sides at once) as the theoretically-correct way to
             get real per-page insets. Both times it printed completely
             edge-to-edge instead — not just failing to add a margin, but
             with #invoice's own padding ALSO stripped out at the same time
             (on the assumption @page would supply it), leaving literally
             nothing creating any inset anywhere. Something in this
             environment's actual PDF/print pipeline wasn't honoring @page
             at all — most likely another @page rule elsewhere in the app
             (same-specificity @page rules resolve by whichever the
             pipeline processes last, which may not match plain HTML
             document order the way normal cascade does), or the export
             path isn't running through a real paginated-print engine.
             Neither of those is something this file can rule out from
             here — @page margin boxes (counter(page)/counter(pages), the
             @bottom-left/@bottom-right rules below) are now genuinely
             supported by Chrome and Chromium-based print pipelines
             (shipped Chrome 131, Nov 2024) where they weren't when the
             comment above was first written, which is the only reason
             this is being tried a third time — but if this environment's
             own @page problem was the real cause of the first two
             failures rather than missing browser support, it will still
             bite this attempt too. TEST AN ACTUAL PRINT/EXPORT of a
             multi-page invoice before trusting this. If it reproduces the
             old edge-to-edge failure, the fix is to revert just this
             block: change 'margin: 0 0 ${FOOTER_MARGIN_MM}mm 0' back to
             'margin: 0', delete the two margin-box rules below, delete
             the #invoice print override that shortens its bottom
             padding/minHeight, and restore the old position:fixed
             "INVOICE {id} — {client}" div this replaced (see git history).
             Kept deliberately smaller than the earlier attempts either
             way: only the BOTTOM side moves into @page margin here, and
             only by ${FOOTER_MARGIN_MM}mm carved out of #invoice's
             existing 15mm bottom padding (see the #invoice override right
             below) rather than added on top of it — top/left/right stay
             exactly as they were, still supplied entirely by #invoice's
             own padding, so even a repeat of the old failure can only
             affect the bottom edge, not strip every side at once. */}
          @page {
            size: ${pageWidthMm}mm ${pageHeightMm}mm;
            margin: 0 0 ${FOOTER_MARGIN_MM}mm 0;
            /* Real total-page-count support — counter(pages) only works
               inside an @page margin-box context like this, never in
               ordinary document content (a plain HTML element, even
               position:fixed, can't read it), which is why this replaces
               the old JS-side "we can't know Y" footer instead of just
               adding a number into it. */
            @bottom-left {
              content: "Page " counter(page) " of " counter(pages);
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #94a3b8;
              /* Left/vertical padding so this sits inset from the physical
                 page edges instead of glued right up against them (which
                 is how it printed before — see the screenshot this was
                 fixed from). 20mm left matches #invoice's own left
                 padding, so the footer lines up with the main content's
                 own edge rather than an arbitrary different inset;
                 vertical-align centers it in the (now taller,
                 ${FOOTER_MARGIN_MM}mm) margin band rather than sitting
                 flush at its bottom, which is this band's own physical
                 bottom edge. */
              padding: 0 0 0 20mm;
              vertical-align: middle;
            }
            /* Same invoice-no./client context the old position:fixed
               footer showed, now on the same true page-margin band as the
               page count instead of floating inside the content area —
               keeps both halves of the footer pinned to the same line on
               every page no matter how #invoice's own content reflows. */
            @bottom-right {
              content: "INVOICE ${escapeCssString(invoice.id)} — ${escapeCssString(invoice.kepada_yth)}";
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #94a3b8;
              /* Mirrors @bottom-left's own comment above — 20mm right
                 padding (matching #invoice's right padding) and vertical
                 centering, so this half isn't glued to the page's right/
                 bottom edges either, and doesn't risk clipping into a
                 printer's unprintable edge margin the way the un-inset
                 version could. */
              padding: 0 20mm 0 0;
              vertical-align: middle;
            }
          }

          /* Print-only shortening of #invoice's own bottom inset to match
             the @page margin added above — ${FOOTER_MARGIN_MM}mm of the
             original 15mm bottom padding now lives in the true page
             margin (for the footer above to sit in) instead of inside
             #invoice's own box, and minHeight drops by the same amount so
             the content area's total height is unchanged and nothing that
             used to fit on one page suddenly doesn't. !important because
             this needs to beat #invoice's own inline style, which
             ordinary specificity can't do. Screen/on-screen preview is
             untouched — this rule only exists inside @media print. */
          #invoice {
            padding-bottom: ${15 - FOOTER_MARGIN_MM}mm !important;
            min-height: ${pageHeightMm - FOOTER_MARGIN_MM}mm !important;
          }

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