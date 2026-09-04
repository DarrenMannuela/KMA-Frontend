import { useRef, useLayoutEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Receipt, Plus, PackageSearch } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp, FormField } from '@/components/ui'
import { useRekening } from '@/utils/RekeningStore'
import { itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { usePaperFormat, PAPER_FORMATS, type PaperFormat } from '@/utils/PaperFormatStore'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'
import type { Invoice, Item, Order } from '@/types'

// The five item-table columns with a natural, content-driven width — every
// one except KETERANGAN, which stays flexible and absorbs whatever width
// the other five don't use (see the column width block below).
type ColumnKey = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

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
// rule's own comment near the bottom of this file for why only top/bottom
// move (not left/right), and why that's a deliberately smaller, more
// isolated attempt at @page margin than the two that already failed here
// before.
const FOOTER_MARGIN_MM = 14
// Same trick, top edge. #invoice's own 20mm padding-top only lands on the
// FIRST page — CSS box fragmentation only applies a box's padding-top (and
// border/margin-top) to the fragment a box STARTS in, not to the fragments
// it continues onto after a page break (padding-bottom is symmetric: it
// only applies to the fragment the box ENDS in, which is exactly why the
// footer fix above was needed too). Left/right padding isn't fragmented
// this way — it re-applies on every fragment — so it was only ever the
// top/bottom edges that could go bare on a continuation page. Concretely:
// when the item table spills onto page 2, that page's <thead> repeats
// right at the physical top edge with zero inset, because page 2 is a
// continuation fragment of the same #invoice box and never gets its
// padding-top. Carving a real @page top margin fixes every continuation
// page at once, the same way FOOTER_MARGIN_MM already fixed the bottom.
const HEADER_MARGIN_MM = 19

// ─── Column auto-fit ───────────────────────────────────────────────────────
// Each of the five fixed-width columns (NO/SIZE/QTY/HARGA NET/JUMLAH) is
// sized to its own longest piece of content automatically, every render —
// no manual dragging, no per-column "click to auto-fit" button, and nothing
// persisted between invoices. That removes an entire class of bug a manual/
// stored width had: a column dragged or fit for one invoice silently
// carrying over as too narrow (clipping) or too wide (wasted space) for the
// next invoice that reuses it, or a column left in a stale state until
// someone remembered to click auto-fit again. Widths are measured with a
// canvas 2d context using the same font the table itself renders with. A
// live DOM measurement of the real <th>/<td> elements was the other option,
// but that needs the table taken out of table-layout:'fixed' (which fixed
// layout depends on to keep a computed width authoritative — see the
// table's own comment below) and a render/paint cycle to read the result
// back; canvas measureText gives an exact width synchronously without
// touching the table at all, so it can just run inline during render.
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

// Same hook OrderDetailPage.tsx's ItemForm already uses for its own Unit
// Price field (see that file's own copy of this comment for the full
// caret-math reasoning) — duplicated here rather than shared, since
// there's no existing shared-hooks module either file already imports
// from, and this component otherwise has no dependency on OrderDetailPage
// at all. Re-render a controlled number input with a freshly
// thousands-formatted string on every keystroke and the caret jumps to
// the end unless something restores it — worse than a plain uppercase
// transform, because formatThousands can also insert/remove a separator
// on the very keystroke that changed the digit next to it, so the caret
// can't just go back to "the same index". What IS stable across a
// reformat is how many DIGITS sit to the left of the caret, so that's
// what's captured and restored instead of a raw character offset.
function useFormattedNumberField(value: number, onValueChange: (n: number) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const digitsBeforeCaret = useRef<number | null>(null)
  const display = value ? formatThousands(String(value)) : ''

  useLayoutEffect(() => {
    if (!ref.current || digitsBeforeCaret.current == null) return
    let digits = 0
    let pos = display.length
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i])) digits++
      if (digits === digitsBeforeCaret.current) { pos = i + 1; break }
    }
    if (digitsBeforeCaret.current === 0) pos = 0
    ref.current.setSelectionRange(pos, pos)
  }, [display])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caretPos = e.target.selectionStart ?? raw.length
    digitsBeforeCaret.current = (raw.slice(0, caretPos).match(/\d/g) ?? []).length
    onValueChange(Number(stripCommas(raw)) || 0)
  }

  return { ref, display, onChange }
}

// ─── Page-flag badge ───────────────────────────────────────────────────────
// Small floating "PAGE X OF Y" pill straddling the seam between two pages in
// the on-screen preview — print:hidden, screen-only, same as everything else
// in this section. The real printed output already gets an authoritative
// page count for free from the browser's own @page margin-box counters
// (counter(page)/counter(pages), see the @bottom-left rule near the bottom
// of this file) — that's the one place this number can ever be verified
// against the browser's REAL pagination rather than this component's
// predicted one, so print doesn't need its own copy of this badge and never
// renders one.
//
// On screen there's no @page context at all (it's a normal scrolled
// document, not paginated by the browser), so nothing else fills that role
// there — this reuses the same `previewTotalPages` estimate the toolbar's
// own "at least N pages" pill already reads, just rendered per-page instead
// of once as a summary.
//
// `edge` picks which side of the nearest `position: relative` ancestor the
// badge straddles: 'top' pokes up and out above that box (used for page 1,
// anchored to invoice-page-wrap itself, since there's no gap above it to
// sit inside of); 'bottom' pokes down out of it (used inside a
// PageBreakGap's own gap bar, so the badge lands right on the seam between
// that gap and the page starting below it, matching the mockup this was
// built from rather than the earlier top-right corner placement).
function PageFlag({ page, total, edge = 'top' }: { page: number; total: number; edge?: 'top' | 'bottom' }) {
  return (
    <div
      className="print:hidden"
      style={{
        position: 'absolute',
        [edge]: '-13px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e293b',
        color: '#fff',
        fontSize: '10px',
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        padding: '3px 12px',
        borderRadius: '999px',
        boxShadow: '0 2px 6px rgba(15,23,42,0.3)',
        zIndex: 5,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      PAGE {page} OF {total}
    </div>
  )
}

// ─── Page-break divider ─────────────────────────────────────────────────
// Stands in for the physical gap between two printed sheets — a recessed,
// paper-colored bar (its background matches the page AROUND #invoice, not
// #invoice's own white, so it reads as a real gap revealing what's behind
// the stack rather than a bar drawn on top of the sheet) with the SAME
// running-footer text the real @page margin box will print sitting just
// above it, and a PageFlag straddling the seam where the next page starts.
// Negative horizontal margin cancels #invoice's own 20mm padding so the bar
// bleeds edge-to-edge across the full sheet width, same trick the old
// marker this replaces already used.
//
// `strong` distinguishes a MANUAL break (the user placed it, so the seam is
// drawn at full strength) from a PREDICTED one (a best-effort guess about
// where natural overflow will land — same shape, just visibly quieter via
// lower opacity/height and an italic caveat underneath, so it never reads
// as a decision the user made). print:hidden throughout — the real running
// footer text is only ever authoritative once it comes from the browser's
// own @page margin box at actual print time (see PageFlag's own comment).
function PageBreakGap({
  endPage, startPage, total, invoiceId, client, strong,
}: {
  endPage: number; startPage: number; total: number
  invoiceId: string; client: string; strong: boolean
}) {
  return (
    <div className="print:hidden" style={{ opacity: strong ? 1 : 0.55, margin: strong ? '10px 0' : '4px 0 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '10px', color: '#94a3b8', padding: '6px 0 8px',
      }}>
        <span>Page {endPage} of {total}</span>
        <span>INVOICE {invoiceId} — {client}</span>
      </div>
      <div style={{ position: 'relative', margin: '0 -20mm' }}>
        <div style={{
          height: strong ? '26px' : '16px',
          background: 'linear-gradient(#e9edf3, #d8dee7, #e9edf3)',
          boxShadow: 'inset 0 3px 6px rgba(15,23,42,0.15), inset 0 -3px 6px rgba(15,23,42,0.15)',
        }} />
        <PageFlag page={startPage} total={total} edge="bottom" />
      </div>
      {!strong && (
        <div style={{ fontSize: '9px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '4px 0 0' }}>
          probably starts page {startPage} here (natural break, not set manually)
        </div>
      )}
    </div>
  )
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
  // CATATAN (notes) list — previously five hardcoded bullet lines with no
  // way to add, remove, or reword any of them for a particular invoice
  // (an order with different shipping terms, a one-off note about this
  // specific client, etc. had nowhere to go except editing the source
  // file itself). Editable the same way everything else on this page
  // already is — signatoryName/signatoryTitle above, the rekening fields
  // further down — which is to say: local to this print session, not
  // persisted to the invoice record. Reloading the page resets it back to
  // these defaults, same as those other fields already do; there's no
  // `notes` column on the invoice this could read/write against, and
  // adding one is a backend change outside this file's reach. The bank
  // transfer line stays a separate fixed bullet after this list rather
  // than joining it — it's structured (three rekening sub-fields wired to
  // useRekening, not plain text) in a way a plain string in this array
  // can't represent, and it's the one CATATAN line that should always be
  // last and never deletable.
  const [notes, setNotes] = useState<string[]>([
    'Barang akan di proses setelah mock up sudah di ACC dan saat D/P 50% sudah masuk',
    'Barang akan di kirim sesuai PO',
    'Saat pengiriman  barang harus membawa PO',
    'Pembayaran 1 minggu saat pelunasan',
    'Tanggal Pengiriman : 2 - 3 minggu hari kerja setelah di terima D/P',
  ])
  const updateNote = (idx: number, value: string) => {
    setNotes(prev => prev.map((n, i) => (i === idx ? value : n)))
  }
  const removeNote = (idx: number) => {
    setNotes(prev => prev.filter((_, i) => i !== idx))
  }
  const addNote = () => {
    setNotes(prev => [...prev, ''])
  }
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

  // ─── Natural break prediction ─────────────────────────────────────────
  // A manual break (above) is known synchronously from state — the user
  // clicked it. A NATURAL break — the item table simply running out of
  // room on a page, the way the totals block did in the screenshot this
  // was built to fix — used to be invisible to this component entirely:
  // only the browser's real print layout engine decides where those land,
  // and there's no API to ask it ahead of time.
  //
  // What makes a reasonable prediction possible without that API: every
  // row group here already carries `pageBreakInside: 'avoid'` (see the
  // per-group <tbody> below), so ANY break — manual or natural — can only
  // ever land at a group boundary, never mid-row. That means measuring
  // each group's own real rendered height and forward-filling against the
  // actual page content height (in px) predicts natural breaks fairly
  // reliably, with no guessing and no iterative scaling.
  //
  // This is a different shape of measurement than the old shrink-to-fit
  // system's fatal one (see the `likelyMultiPage` heuristic's own comment
  // just below, still used as a fallback until the first measurement
  // lands, for why a measure-then-setState loop blanked the page there):
  // that system fed its OWN measured result back into what it was
  // measuring (a zoom/font-scale that changed the very layout being
  // measured), which is what let it oscillate forever. Here, the measured
  // heights never feed back into anything that changes layout — they only
  // drive which continuation notes print and what the page-count badge
  // says — so the effect below settles after one pass: it re-measures on
  // every relevant render, but only calls setState when a height actually
  // changed, and nothing it does changes a height.
  const topBlockRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const groupRefs = useRef<Record<string, HTMLTableSectionElement | null>>({})
  const totalsRef = useRef<HTMLTableSectionElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{
    top: number; thead: number; groups: Record<string, number>; totals: number; notes: number; closing: number
  }>({ top: 0, thead: 0, groups: {}, totals: 0, notes: 0, closing: 0 })
  // The effect that actually populates `measured` lives further down (see
  // "measure natural-break heights" below) — it needs `items`,
  // `pageWidthMm`/`pageHeightMm`, and `invoice`, none of which exist yet
  // at this point in the component, so it's declared right after those
  // instead of up here with its refs/state.

  // Purely decorative: a rough, one-shot estimate of whether the document
  // is long enough that the closing block will likely end up starting its
  // own page, used only to decide whether to show the small continuation
  // letterhead in front of it (see the closing block below). This is NOT
  // trying to precisely predict the real print engine's page breaks the
  // way the old shrink-to-fit system did — the actual pagination is left
  // entirely to the browser's natural table/row flow described above.
  // Worst case this guesses wrong and the little context strip shows up
  // when not strictly needed (or doesn't show up once when it would have
  // been nice to have) — low-stakes either way. Used below only as a
  // fallback for the page-count badge until the real measurement (above)
  // has run at least once — see computePredictedBreaks below for the
  // measured version this defers to once it's available.
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
  // needs its own effect or state at all. (The new group-height
  // measurement above sidesteps the same trap a different way: see its
  // own comment.)

  const { data: invoice, isLoading: invoiceLoading, isError: invoiceError, refetch: refetchInvoice } = useQuery({
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
  const newItemPriceField = useFormattedNumberField(newItemPrice, setNewItemPrice)

  // Same "Pick from Catalogue" shortcut OrderDetailPage.tsx's own
  // ItemForm offers — only fetched/shown when this invoice's order is
  // actually linked to a client (an unlinked order has no catalogue to
  // pick from, same condition OrderDetailPage's copy checks). Picking an
  // entry is purely a shortcut that fills in the fields below; everything
  // stays editable afterward exactly like manual entry, and typing a name
  // that doesn't match anything in the catalogue still works unchanged.
  const { data: catalogue = [] } = clientItemHooks.useByClient(order?.client_id ?? undefined)
  const { data: pricesGrouped = {} } = clientItemPriceHooks.useGrouped()
  const [catalogueItemId, setCatalogueItemId] = useState<number | ''>('')

  const latestPriceFor = (clientItemId: number) => {
    const history = pricesGrouped[String(clientItemId)] ?? []
    if (history.length === 0) return undefined
    return [...history].sort((a, b) => b.year - a.year)[0].price
  }

  const handlePickCatalogueItem = (idStr: string) => {
    if (!idStr) { setCatalogueItemId(''); return }
    const id = Number(idStr)
    const item = catalogue.find(c => c.id === id)
    if (!item) return
    setCatalogueItemId(id)
    const price = latestPriceFor(id)
    // Goes through .setValue() directly rather than typing into the
    // field — OrderDetailPage's own version notes why the value still
    // needs the explicit .toUpperCase() here even though manual entry
    // already goes through UppercaseField on every keystroke: picking
    // from the catalogue bypasses that per-keystroke path entirely, and
    // the backend's dedupe-merge (idx_items_dedupe) is an exact string
    // match, so mismatched casing would silently stop two
    // visually-identical items from ever merging into one row.
    newItemName.setValue(item.item_name.toUpperCase())
    newItemSize.setValue((item.size ?? '').toUpperCase())
    if (price != null) setNewItemPrice(price)
  }

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
          setCatalogueItemId('')
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

  // Measures the real rendered heights the natural-break forward-fill
  // (further down) needs — see the "Natural break prediction" comment
  // near the top of this file for the full reasoning, and for why this
  // settles instead of looping the way the old shrink-to-fit measurement
  // effect did: nothing here feeds back into layout, so once the DOM
  // actually matches `items`, re-measuring returns the same numbers and
  // `changed` goes false.
  useLayoutEffect(() => {
    // Built with an explicit accumulator rather than
    // Object.fromEntries(Object.entries(...).map(...)) — the untyped
    // tuple that map returns there is one more place inference can go
    // sideways for no real benefit; a plain loop keeps every value's type
    // explicit.
    const groupHeights: Record<string, number> = {}
    Object.entries(groupRefs.current).forEach(([name, el]) => {
      groupHeights[name] = el?.getBoundingClientRect().height ?? 0
    })
    const next = {
      top: topBlockRef.current?.getBoundingClientRect().height ?? 0,
      thead: theadRef.current?.getBoundingClientRect().height ?? 0,
      groups: groupHeights,
      totals: totalsRef.current?.getBoundingClientRect().height ?? 0,
      notes: notesRef.current?.getBoundingClientRect().height ?? 0,
      closing: closingRef.current?.getBoundingClientRect().height ?? 0,
    }
    const changed =
      Math.abs(next.top - measured.top) > 0.5 ||
      Math.abs(next.thead - measured.thead) > 0.5 ||
      Math.abs(next.totals - measured.totals) > 0.5 ||
      Math.abs(next.notes - measured.notes) > 0.5 ||
      Math.abs(next.closing - measured.closing) > 0.5 ||
      Object.keys(next.groups).length !== Object.keys(measured.groups).length ||
      Object.entries(next.groups).some(([name, h]) => Math.abs(h - (measured.groups[name] ?? 0)) > 0.5)
    if (changed) setMeasured(next)
    // Re-measure whenever the items/groups actually change, or the sheet
    // dimensions do — NOT on every render (that would be what including
    // `measured` itself as a dependency does, and is exactly the loop
    // shape the comment above describes avoiding).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pageWidthMm, pageHeightMm, invoice?.id])

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

  // Forward-fill the measured heights (see the "Natural break prediction"
  // comment above) against the real per-page content height in px, to
  // predict where a NATURAL break will land — same bin-packing idea as
  // the manual breaks, just driven by measured height instead of a click.
  //
  // Page content height, in px, per page:
  //   - Every page loses HEADER_MARGIN_MM + FOOTER_MARGIN_MM to the real
  //     @page margin band (see that constant's own comment) — that band
  //     applies to every page equally, it's not #invoice's own padding.
  //   - Page 1 additionally loses the sliver of #invoice's own padding
  //     that DOESN'T move into the @page margin — (20 - HEADER_MARGIN_MM)
  //     top + (15 - FOOTER_MARGIN_MM) bottom, a couple mm — since box
  //     fragmentation gives that padding only to the fragment that starts/
  //     ends the box (see HEADER_MARGIN_MM's own comment for why). Later
  //     pages don't carry it at all under fragmentation, so they get the
  //     full margin-only content height.
  const pageMarginPx = (HEADER_MARGIN_MM + FOOTER_MARGIN_MM) * MM_TO_PX
  const firstPageOwnPaddingPx = ((20 - HEADER_MARGIN_MM) + (15 - FOOTER_MARGIN_MM)) * MM_TO_PX
  const firstPageContentPx = pageHeightPx - pageMarginPx - firstPageOwnPaddingPx
  const laterPageContentPx = pageHeightPx - pageMarginPx

  // Only trustworthy once the layout effect above has actually measured
  // something — on the very first render (or right after items/paper
  // format change, before that effect has run) every height is still 0,
  // which would predict a break before every single group. `hasMeasurements`
  // gates that off; `likelyMultiPage` (the plain heuristic above) covers
  // the badge in the meantime.
  const hasMeasurements = measured.top > 0 || Object.keys(measured.groups).length > 0
  const predictedBreaks = new Set<string>()
  // Per-block tail flags — see the check below for why these are no
  // longer a single combined boolean.
  let predictedTotalsNewPage = false
  let predictedNotesNewPage = false
  let predictedClosingNewPage = false
  if (hasMeasurements) {
    let remaining = firstPageContentPx - measured.top - measured.thead
    groups.forEach((g, i) => {
      const h = measured.groups[g.name] ?? 0
      // A manual break resets `remaining` to a fresh page's budget the
      // same way a predicted one does (below) — this was the actual bug:
      // previously only the predicted branch reset it, so a manual break
      // left `remaining` carrying over whatever (likely deeply negative)
      // budget the page BEFORE it had ended with. Every group after that
      // manual break then kept comparing its height against that stale
      // leftover instead of a real fresh page, so it looked like nothing
      // after the manual break could ever fit — including the totals
      // tail, which got wrongly predicted onto a bogus extra page even
      // though the manually-started page had plenty of real room for it.
      if (i > 0 && manualBreaks.has(g.name)) {
        remaining = laterPageContentPx - measured.thead
      } else if (i > 0 && !manualBreaks.has(g.name) && h > 0 && h > remaining) {
        predictedBreaks.add(g.name)
        remaining = laterPageContentPx - measured.thead
      }
      remaining -= h
    })
    // The totals block, notes, and signature/footer each carry their own
    // `pageBreakInside: 'avoid'`, but nothing in the actual DOM/CSS glues
    // those three separate elements to EACH OTHER — the browser is free to
    // keep totals on the current page while only notes/closing spill to
    // the next one, or any other split between them. Treating their
    // combined height as one lump (the old approach) didn't reflect that:
    // whenever the combined height didn't fit, it predicted ALL THREE
    // moving to a fresh page together, even on invoices (like this one)
    // where only the last block or two actually overflowed and an earlier
    // block — TOTAL, here — comfortably stayed put on the real printed
    // page. That mismatch is exactly what the screenshots show: the
    // on-screen prediction moved TOTAL to page 2, but the real PDF kept it
    // on page 1.
    //
    // Checked independently instead, in the same document order they
    // render in and the same "does it fit in what's left, else start a
    // fresh page" logic already used for item groups above — each block
    // only lands on a new page if IT specifically doesn't fit in what's
    // left after the block(s) before it.
    if (measured.totals > 0 && measured.totals > remaining) {
      predictedTotalsNewPage = true
      // The totals block is still a <tbody> of the same <table> as the
      // item groups, so a fresh page repeats the <thead> above it exactly
      // like it would above any other continuation tbody.
      remaining = laterPageContentPx - measured.thead
    }
    remaining -= measured.totals

    if (measured.notes > 0 && measured.notes > remaining) {
      predictedNotesNewPage = true
      // Notes lives outside the <table> entirely (a plain div after it),
      // so a fresh page for it doesn't reserve any thead height.
      remaining = laterPageContentPx
    }
    remaining -= measured.notes

    if (measured.closing > 0 && measured.closing > remaining) {
      predictedClosingNewPage = true
      remaining = laterPageContentPx
    }
    remaining -= measured.closing
  }
  // How many pages the tail predicts adding beyond the item table's own
  // pages — one for each block above that lands on a fresh page, since
  // each such break starts a new physical page rather than sharing one.
  const tailNewPageCount =
    Number(predictedTotalsNewPage) + Number(predictedNotesNewPage) + Number(predictedClosingNewPage)

  // Splits `groups` into page segments at every break — manual ones are
  // KNOWN synchronously from state (the user clicked a toggle); predicted
  // ones (above) are a best-effort natural-overflow estimate. Combining
  // both here means the on-screen break marker, the page-count badge, and
  // the printed continuation notes all agree with each other, instead of
  // only ever knowing about the breaks the user placed by hand.
  //
  // Deliberately NOT used to split the item table into separate DOM
  // elements per page — the table stays one continuous flow, same as
  // before (see the multi-page policy comment at the top of the file for
  // why: the browser's own natural table/row pagination is still what
  // actually decides where a natural break lands; this is a prediction of
  // that decision, not a substitute for it). What this DOES drive is the
  // on-screen break marker at each manual break — instead of a thin
  // dashed rule, it now reads as a real page edge with an accurate "Page N
  // → Page N+1" label, using the segment number computed here.
  const pageSegments: { groups: typeof groups }[] = []
  const groupPageNumber = new Map<string, number>()
  groups.forEach((g, i) => {
    if (i > 0 && (manualBreaks.has(g.name) || predictedBreaks.has(g.name))) pageSegments.push({ groups: [g] })
    else if (pageSegments.length === 0) pageSegments.push({ groups: [g] })
    else pageSegments[pageSegments.length - 1].groups.push(g)
    groupPageNumber.set(g.name, pageSegments.length)
  })
  if (pageSegments.length === 0) pageSegments.push({ groups: [] })
  // Running page numbers for the tail's own break markers further down —
  // each block's marker needs to say "ends page X, starts page X+1" using
  // whichever page the PREVIOUS tail block actually landed on, not always
  // "the last item-table page", since totals/notes/closing can now each
  // independently decide to start fresh. Declared here (after
  // `pageSegments` exists) rather than up with the other tail flags, since
  // `pageSegments.length` is what totalsPageNumber is anchored to.
  const totalsPageNumber = pageSegments.length + (predictedTotalsNewPage ? 1 : 0)
  const notesPageNumber = totalsPageNumber + (predictedNotesNewPage ? 1 : 0)
  const closingPageNumber = notesPageNumber + (predictedClosingNewPage ? 1 : 0)
  // Each tail block predicted onto its own fresh page counts toward the
  // total too, same as a manual/predicted break between two item groups
  // would — now potentially more than one, since totals/notes/closing are
  // each checked (and can each break) independently. Equals `closingPageNumber`
  // above, since that's the last page number in the chain.
  const totalPredictedPages = pageSegments.length + tailNewPageCount
  // Single number the toolbar's "at least N pages" pill AND every
  // on-screen PageFlag badge (below) read from, so a page badge floating
  // over page 1 can never say "OF 2" while the toolbar pill says "at
  // least 3" — same reasoning as `groups` being a single source of truth
  // for the table and the page-segmentation above. Once real heights are
  // measured, `totalPredictedPages` (which already folds in predicted
  // natural breaks, not just manual ones) is a strictly better estimate
  // than the plain row-count heuristic — falls back to that heuristic
  // only for the brief window before the first measurement lands. The
  // `likelyMultiPage` floor covers the same brief window one more way:
  // without it, a long invoice would flash "1 page" for one frame before
  // the heuristic above even gets a chance to disagree.
  const previewTotalPages = Math.max(
    hasMeasurements ? totalPredictedPages : pageSegments.length,
    likelyMultiPage ? 2 : 1,
  )

  if (invoiceLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // Same distinction as KwitansiPrintPage: a failed fetch (network drop,
  // 500, etc.) previously rendered identically to a genuinely missing
  // invoice — "Invoice not found." — which sent people looking for a typo
  // in the URL instead of just retrying.
  if (invoiceError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this invoice — check your connection and try again.</p>
        <button onClick={() => refetchInvoice()} className="btn-secondary">Retry</button>
      </div>
    )
  }
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

  // What's actually rendered in each column right now, and the resulting
  // width — recomputed fresh every render, so it's always in sync with
  // THIS invoice's real content and never needs a manual trigger. KETERANGAN
  // has no entry — it's the one column that's meant to stay flexible and
  // absorb whatever width the other five don't use, so it has no fitted
  // width of its own.
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
      // Matches the PELUNASAN cell's actual rendered value below — must
      // stay in sync or a discounted invoice could size the JUMLAH column
      // to a number narrower than what's really printed in it.
      (invoice.ar_receivable ?? invoice.remaining).toLocaleString('id-ID'),
    ],
  }
  const fitWidthFor = (column: ColumnKey) =>
    columnTexts[column].reduce((max, t) => Math.max(max, measureTextWidth(t, AUTOFIT_FONT)), 0) + AUTOFIT_PADDING
  const columnWidths: Record<ColumnKey, number> = {
    no: fitWidthFor('no'),
    size: fitWidthFor('size'),
    qty: fitWidthFor('qty'),
    hargaNet: fitWidthFor('hargaNet'),
    jumlah: fitWidthFor('jumlah'),
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
          {/* Once real heights are measured, `totalPredictedPages` (which
              already folds in the predicted natural breaks, not just
              manual ones) is a strictly better estimate than the plain
              row-count heuristic — falls back to that heuristic only for
              the brief window before the first measurement lands. Still
              phrased as "at least": a predicted break can still be wrong
              in either direction (see the prediction comment above). */}
          {previewTotalPages > 1 && (
            <span className="badge bg-slate-100 text-slate-600">
              at least {previewTotalPages} page{previewTotalPages === 1 ? '' : 's'}
            </span>
          )}
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

      {/* Invoice document */}
      <div className="p-8 print:p-0">
        <div id="invoice-page-wrap" style={{ width: `${pageWidthMm}mm`, position: 'relative' }} className="mx-auto">
          {/* Page 1 never gets a break marker of its own — those only ever
              mark the START of a page AFTER the first (see the manual/
              predicted markers inside the item table below) — so it's the
              one page whose badge can't just live next to an existing
              marker; it's anchored directly to invoice-page-wrap's own
              position:relative instead, which places it at the sheet's own
              top-right corner regardless of how tall page 1's own content
              ends up being. */}
          <PageFlag page={1} total={previewTotalPages} />
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
          {/* Wraps everything above the item table (logo/masthead, title,
              client + invoice-meta grid) purely so its combined rendered
              height can be measured as one number for the natural-break
              forward-fill above — see the "Natural break prediction"
              comment near the top of this file. No layout effect: it's a
              plain div with no styling of its own. */}
          <div ref={topBlockRef}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img src="/Logo.png" alt="KMA Logo" style={{ width: '80px', height: 'auto', marginBottom: '6px' }} />
              <div style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}>KREASI  MAKMUR  ABADI</div>
            </div>
            {/* Same address/phone/email already printed once at the very
                end of the document (see the closing "Footer" block below) —
                repeated here so the issuing company gets the same
                letterhead-level contact block the client already gets in
                the KEPADA YTH grid, instead of only appearing after
                whoever's reading has already scrolled past the whole
                invoice. Deliberately NOT wired up as editable inputs like
                signatoryName/rekening above: unlike a signer or a bank
                account, this is fixed company info that doesn't vary
                invoice-to-invoice, same reasoning as why the footer's copy
                of it below was always plain text too. NPWP intentionally
                left out — that's a real tax ID, not something to guess at,
                so it stays out until an actual number is supplied. */}
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#334155', lineHeight: '1.5', maxWidth: '220px' }}>
              <div>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55, JAKARTA UTARA 14450</div>
              <div>TELP. 021.300.253.99 / Hp. 0811.857.372</div>
              <div>Email : fifi67@yahoo.com</div>
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
          </div>
          {/* ↑ closes the topBlockRef wrapper opened just above "Header" */}

          {/* Items table */}
          {/* table-layout:'fixed' rather than the default 'auto': with auto
              layout, an explicit <th> width is only a hint — the browser
              still grows a column to fit whatever's actually rendered
              inside it, which defeats a computed width from ever taking
              effect (the numbers/labels would just keep forcing the column
              back open to their own size regardless of what was computed).
              Fixed layout makes the <th> widths below authoritative, so
              columnWidths (each column sized to its own longest piece of
              content, computed fresh every render — see the "Column
              auto-fit" comment near the top of this file) actually
              controls what prints. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: `${BASE_FONT_PX}px`, tableLayout: 'fixed' }}>
            <thead ref={theadRef}>
              {/* Column dividers use a darker border (#94a3b8) than the
                  rest of the table (#ccc) — against a light highlight
                  fill, the lighter gray had almost no contrast and the
                  vertical lines between columns basically disappeared. */}
              <tr style={highlightCellStyle}>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.no}px`, whiteSpace: 'nowrap' }}>
                  NO.
                </th>
                {/* KETERANGAN is the one column that's meant to stay
                    flexible and absorb whatever width the other five don't
                    use (see the ColumnKey/columnWidths comments above), so
                    it intentionally has no fitted width. Also the one
                    header left free to wrap onto multiple lines rather than
                    nowrap like the rest — it's a single word ("KETERANGAN")
                    so wrapping was never the actual problem here, and this
                    column is exactly the one place text SHOULD be allowed
                    to wrap (long item names), not get clipped. */}
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left' }}>KETERANGAN</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.size}px`, whiteSpace: 'nowrap' }}>
                  SIZE
                </th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.qty}px`, whiteSpace: 'nowrap' }}>
                  QTY
                </th>
                {/* hargaNet/jumlah: width comes from fitWidthFor, sized to
                    this invoice's own longest HARGA NET/JUMLAH (Rp) value.
                    No overflow-hidden/ellipsis safety net — a column that
                    somehow still ends up narrower than its text shows that
                    text visibly overflowing instead of silently clipping it
                    away, so a sizing bug would be obvious rather than
                    hidden. */}
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.hargaNet}px`, whiteSpace: 'nowrap' }}>
                  HARGA NET
                </th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.jumlah}px`, whiteSpace: 'nowrap' }}>
                  JUMLAH (Rp)
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
              // A manual break is known synchronously from state (the
              // user clicked it); a predicted break (see the "Natural
              // break prediction" comment near the top of this file) is a
              // best-effort estimate of where the browser's own natural
              // overflow will land, from measured group heights. Both can
              // drive the printed continuation note (below) — only the
              // manual one forces an actual CSS page-break-before, since
              // the predicted one is a guess about natural flow, not an
              // instruction to override it (forcing it would turn a
              // prediction into a self-fulfilling break, which defeats
              // the point of predicting the natural one).
              const manualBreakHere = manualBreaks.has(group.name) && groupIdx > 0
              const predictedBreakHere = !manualBreakHere && predictedBreaks.has(group.name) && groupIdx > 0
              const showBreakMarker = manualBreakHere
              const endOfPageLabel = groupPageNumber.get(group.name)! - 1
              const startOfPageLabel = groupPageNumber.get(group.name)
              // Whether THIS group is the last one on its page — i.e. the
              // NEXT group carries a manual OR predicted break, so this
              // page may end with blank space below it rather than
              // running naturally into more content. Needed so a
              // "continued on next page" note can be printed at the
              // bottom of the page that's ending, not just a "continued
              // from previous page" note at the top of the one starting —
              // a client reading only the finished PDF has no way to tell
              // "this page ended on purpose, more follows" from "this is
              // the last page" without something printed on the page
              // itself; the screen-only marker above never reaches them.
              // Including predicted breaks here is the actual fix for the
              // original bug report: a natural break (the totals block
              // spilling to page 2) used to print with no note at all,
              // because this only ever checked manualBreaks.
              const nextGroup = groups[groupIdx + 1]
              // The last group has no "next group" to carry a break, but
              // the totals block that immediately follows it (see the
              // per-block tail check above) can still be predicted to
              // spill onto its own fresh page — exactly the case from the
              // original bug report (the totals block landing on page 2
              // with nothing printed to explain why page 1 ends with blank
              // space). Only `predictedTotalsNewPage` matters here, not
              // notes/closing breaking further down — this note marks the
              // seam right after the item table, which is specifically
              // where totals sits.
              const isLastGroup = groupIdx === groups.length - 1
              const endsPageHere = nextGroup
                ? (manualBreaks.has(nextGroup.name) || predictedBreaks.has(nextGroup.name))
                : (isLastGroup && predictedTotalsNewPage)

              return (
                <tbody
                  key={group.name}
                  ref={el => { groupRefs.current[group.name] = el }}
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
                        <PageBreakGap
                          endPage={endOfPageLabel}
                          startPage={startOfPageLabel!}
                          total={previewTotalPages}
                          invoiceId={invoice.id}
                          client={invoice.kepada_yth}
                          strong
                        />
                      </td>
                    </tr>
                  )}
                  {/* Lighter, screen-only hint for a PREDICTED (not
                      user-placed) natural break — deliberately a thin
                      dashed rule rather than the bold "END OF PAGE" bar
                      above, so it doesn't read as an editable action point
                      the way a manual break's marker does; this is only
                      ever this component's best guess, not something the
                      user set. Lets whoever's laying out the invoice see
                      roughly where the page will likely turn on its own,
                      without implying it's a toggle. */}
                  {predictedBreakHere && (
                    <tr className="print:hidden">
                      <td colSpan={6} style={{ padding: '4px 0' }}>
                        <PageBreakGap
                          endPage={endOfPageLabel}
                          startPage={startOfPageLabel!}
                          total={previewTotalPages}
                          invoiceId={invoice.id}
                          client={invoice.kepada_yth}
                          strong={false}
                        />
                      </td>
                    </tr>
                  )}
                  {/* No "continued from previous page" counterpart here on
                      purpose — the "continued on next page" note printed at
                      the bottom of the PRIOR page (below) already tells the
                      client the invoice keeps going, so repeating that same
                      fact at the top of this page was pure redundancy, not
                      new information. Only kept the one that's the client's
                      first/only signal of a coming break. */}
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
                  {/* Prints at the bottom of the page that's about to end.
                      Without this, any blank space below the last item on
                      this page (which can be most of the sheet, if the
                      break was placed right after a short group) looks
                      like the invoice just stopped rather than continuing,
                      which is exactly the confusion this was asked to fix.
                      This is the only continuation note printed now — see
                      the comment where the top-of-page counterpart used to
                      sit, just above the item rows — since a client who
                      just read this on page N already knows page N+1
                      continues it without page N+1 saying so again. Hidden
                      on screen for the same reason as the admin marker
                      above already covers this for whoever's placing the
                      break; this copy is only for the printed page
                      itself. */}
                  {endsPageHere && (
                    <tr className="continuation-note">
                      <td colSpan={6} style={{ padding: '10px 8px 0', textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', borderTop: 'none', borderBottom: 'none' }}>
                        (continued on next page)
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}

            {/* Bug fix: the totals block can be predicted to overflow onto
                its own fresh page WITHOUT any item group ever breaking —
                e.g. every item fits comfortably on page 1, and only TOTAL/
                D-P/PELUNASAN spill over. The marker above only ever renders
                between two item groups, keyed to a group boundary — there
                IS no group boundary here, so that marker never fires for
                this case and page 2 previously had no visible seam, no
                "PAGE 2 OF N" badge, and no gap at all: it just silently
                continued as if there were still only one page. This is the
                missing counterpart for that specific gap. No manual/strong
                variant exists for it (manualBreaks only key by item group
                name — there's nothing to toggle between "last group" and
                "totals"), so it's always the lighter "predicted" styling.
                Only checks `predictedTotalsNewPage` now — not a combined
                tail flag — since notes/closing breaking on their own,
                further down, doesn't mean totals did too (see the
                independent per-block check above). */}
            {predictedTotalsNewPage && (
              <tbody className="print:hidden">
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <PageBreakGap
                      endPage={pageSegments.length}
                      startPage={totalsPageNumber}
                      total={previewTotalPages}
                      invoiceId={invoice.id}
                      client={invoice.kepada_yth}
                      strong={false}
                    />
                  </td>
                </tr>
              </tbody>
            )}

            {/* TOTAL / D.P / PELUNASAN together in their own tbody, same
                reasoning as the per-item groups above — these three rows
                read as one unit, so a page break landing between e.g.
                TOTAL and PELUNASAN would be far more confusing than one
                between two ordinary item rows. */}
            <tbody ref={totalsRef} style={{ pageBreakInside: 'avoid' }}>
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
                // Same vertical-spacing goal as the real D/P row above
                // (keep the gap before PELUNASAN uniform whether or not
                // this invoice has an actual D/P line) — but without
                // drawing a fully bordered, entirely empty 6-column grid
                // row to do it, which read as leftover/broken table lines
                // with nothing in them (see the "residual column lines"
                // this replaced). Structured exactly like the real D/P
                // row: NO/KETERANGAN/SIZE stay a borderless spacer (those
                // three never had anything to show here anyway), while
                // QTY/label/amount keep their normal borders — blank, but
                // still part of the table's grid — so the right-hand edge
                // stays visually closed against the TOTAL row above and
                // PELUNASAN row below, the same as it already does when
                // there IS a real D/P line.
                <tr onClick={() => toggleRowHighlight('dp')} className="cursor-pointer print:cursor-default">
                  <td style={{ padding: '6px 8px', borderTopStyle: 'hidden', borderBottomStyle: 'hidden' }} colSpan={3} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] }} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] }} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', background: rowHighlights['dp'] }} />
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
                  {/* ar_receivable is `remaining` with any discount
                      already subtracted (see GenerateInvoiceForm) —
                      printing `remaining` here would show the client a
                      bigger PELUNASAN figure than they actually owe
                      whenever a discount was applied on this invoice.
                      Falls back to `remaining` for older invoices saved
                      before ar_receivable existed. */}
                  {(invoice.ar_receivable ?? invoice.remaining).toLocaleString('id-ID')}
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
              every field is filled in. Laid out the same way
              OrderDetailPage.tsx's own ItemForm is (FormField-labeled
              grid, catalogue picker on top, a Subtotal strip before the
              action button) rather than this panel's previous
              single-row-of-tiny-inputs shape, so a form the person
              already knows from adding items there doesn't look like a
              completely different control here. */}
          <div className="print:hidden space-y-4" style={{ marginTop: '8px', background: '#f8fafc', borderRadius: '6px', padding: '16px' }}>
            {catalogue.length > 0 && (
              <FormField label="Pick from Catalogue (optional)">
                <div className="relative">
                  <PackageSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select className="field pl-8" value={catalogueItemId} onChange={e => handlePickCatalogueItem(e.target.value)}>
                    <option value="">Type manually instead…</option>
                    {catalogue.map(c => (
                      <option key={c.id} value={c.id}>{c.item_name}{c.size ? ` (${c.size})` : ''}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Fills in the name, size, and latest catalogue price below — everything stays editable, or just skip this and type the item directly.
                </p>
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Item Name" required>
                <input
                  ref={newItemName.ref}
                  value={newItemName.value}
                  onChange={newItemName.onChange}
                  placeholder="e.g. APRON"
                  className="field"
                />
              </FormField>
              <FormField label="Size">
                <input
                  ref={newItemSize.ref}
                  value={newItemSize.value}
                  onChange={newItemSize.onChange}
                  placeholder="e.g. S, M, L"
                  className="field"
                />
              </FormField>
              <FormField label="Qty" required>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newItemAmount || ''}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setNewItemAmount(digits === '' ? 0 : Math.trunc(Number(digits)))
                  }}
                  className="field"
                />
              </FormField>
              <FormField label="Unit Price (Rp)" required>
                <input
                  className="field font-mono"
                  type="text"
                  inputMode="numeric"
                  ref={newItemPriceField.ref}
                  value={newItemPriceField.display}
                  onChange={newItemPriceField.onChange}
                />
              </FormField>
            </div>
            <div className="bg-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-slate-500">Subtotal</span>
              <span className="font-mono font-semibold">{formatRp(newItemAmount * newItemPrice)}</span>
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

          {/* Counterpart to the totals-block marker above, for the same
              reason: notes lives outside the item <table> entirely, so
              there's no group boundary to hang a break marker on, and it
              can now be predicted to move to its own fresh page
              independently of whether totals did (see the per-block check
              above) — e.g. totals still fits right after the table, but
              notes itself is long enough that it doesn't. */}
          {predictedNotesNewPage && (
            <PageBreakGap
              endPage={totalsPageNumber}
              startPage={notesPageNumber}
              total={previewTotalPages}
              invoiceId={invoice.id}
              client={invoice.kepada_yth}
              strong={false}
            />
          )}

          {/* Notes */}
          <div ref={notesRef} style={{ marginTop: '24px', fontSize: `${BASE_FONT_PX}px`, pageBreakInside: 'avoid' }}>
            <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '4px' }}>SYARAT & KETENTUAN :</div>
            <ol style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
              {notes.map((note, idx) => (
                // An empty line stays editable on screen (so clearing text
                // to retype it doesn't make the row vanish mid-edit) but
                // is hidden from print entirely — an empty numbered bullet
                // would otherwise show up as a stray "6." with nothing
                // after it on the actual printed document.
                <li key={idx} className={note.trim() === '' ? 'print:hidden' : undefined} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    value={note}
                    onChange={e => updateNote(idx, e.target.value)}
                    placeholder="Note text…"
                    style={{ border: 'none', background: 'transparent', font: 'inherit', width: '100%', padding: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeNote(idx)}
                    className="print:hidden"
                    title="Remove this note"
                    style={{ flexShrink: 0, width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center', borderRadius: '999px', border: 'none', background: '#e2e8f0', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={addNote}
              className="print:hidden btn-secondary flex items-center gap-1.5"
              style={{ marginTop: '8px', fontSize: '12px', padding: '4px 10px' }}
            >
              <Plus size={12} /> Add note
            </button>

            {/* Bank details used to live as the last numbered bullet in the
                list above — easy to skim past when it's mixed in with
                shipping/production terms, and finance staff scanning for
                "where do I send the money" shouldn't have to read a
                numbered terms list to find it. Pulled into its own
                boxed/labeled block instead, same rekening fields as before
                (still shared with KwitansiPrintPage via useRekening — this
                isn't a second copy of that data, just a different spot to
                edit and print it from). */}
            <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>INFORMASI PEMBAYARAN</div>
              <div>Pembayaran via transfer ke rekening a/n :</div>
              <div style={{ marginTop: '2px' }}>
                <input
                  value={rekening.accountName}
                  onChange={e => setRekening({ accountName: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 'bold', width: '220px', padding: 0 }}
                />
              </div>
              <div>
                <input
                  value={rekening.bankBranch}
                  onChange={e => setRekening({ bankBranch: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', width: '220px', padding: 0 }}
                />
              </div>
              <div>
                No Rek. <input
                  value={rekening.accountNumber}
                  onChange={e => setRekening({ accountNumber: e.target.value })}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 'bold', width: '160px', padding: 0 }}
                />
              </div>
            </div>
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
          {/* Same counterpart as the notes marker above, one block later:
              closing (signature + footer) can independently be predicted
              to move to its own fresh page even when totals and notes both
              stayed put. */}
          {predictedClosingNewPage && (
            <PageBreakGap
              endPage={notesPageNumber}
              startPage={closingPageNumber}
              total={previewTotalPages}
              invoiceId={invoice.id}
              client={invoice.kepada_yth}
              strong={false}
            />
          )}

          <div ref={closingRef} style={{ pageBreakInside: 'avoid' }}>
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

          {/* Preview of the LAST page's own running footer — every earlier
              page's preview lives inline in its PageBreakGap (right where
              that page ends, see the component's own comment), but the
              final page has no gap after it to attach one to, so it's
              rendered once here instead. Skipped entirely on a single-page
              invoice: there's no page transition to preview a footer
              against, and the real @page footer for a lone page needs no
              on-screen rehearsal. */}
          {previewTotalPages > 1 && (
            <div className="print:hidden" style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '10px', color: '#94a3b8', padding: '10px 0 0',
            }}>
              <span>Page {previewTotalPages} of {previewTotalPages}</span>
              <span>INVOICE {invoice.id} — {invoice.kepada_yth}</span>
            </div>
          )}

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
        /* Off by default — this is the print-only "(continued on next
           page)" row, meant purely for whoever ends up holding the
           printed/PDF pages (see the .continuation-note row in the item
           table above; its "continued from previous page" counterpart at
           the top of the following page was removed as redundant — this
           note already told the reader the invoice continues). It'd be
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

          /* @page margin was tried twice here before (20mm/20mm/15mm/20mm,
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
             block: change 'margin: ${HEADER_MARGIN_MM}mm 0 ${FOOTER_MARGIN_MM}mm 0'
             back to 'margin: 0', delete the two margin-box rules below,
             delete the #invoice print override that shortens its top/
             bottom padding/minHeight, and restore the old position:fixed
             "INVOICE {id} — {client}" div this replaced (see git history).
             Kept deliberately smaller than the earlier (all-four-sides-
             at-once) attempts: only TOP and BOTTOM move into @page margin
             here — ${HEADER_MARGIN_MM}mm and ${FOOTER_MARGIN_MM}mm
             respectively, each carved out of #invoice's own existing
             20mm/15mm padding on that side (see the #invoice override
             right below) rather than added on top of it. LEFT/RIGHT stay
             exactly as they were, still supplied entirely by #invoice's
             own padding — box fragmentation re-applies left/right padding
             to every page a box spans, so those two sides never had the
             bare-edge problem top/bottom did (see HEADER_MARGIN_MM's own
             comment above) and don't need an @page margin to fix it. Even
             a repeat of the old failure here can only affect the top/
             bottom edges, not strip every side at once. Top was added
             after bottom had already been confirmed working in print —
             if TOP specifically reproduces the old edge-to-edge failure
             (but bottom still doesn't), the fix is to revert just the
             top half: drop the leading ${HEADER_MARGIN_MM}mm back to 0 in
             the margin line below, and drop the padding-top override in
             the #invoice block below back out (padding stays the plain
             20mm from #invoice's own inline style, unreduced). */
          @page {
            size: ${pageWidthMm}mm ${pageHeightMm}mm;
            margin: ${HEADER_MARGIN_MM}mm 0 ${FOOTER_MARGIN_MM}mm 0;
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

          /* Print-only shortening of #invoice's own top AND bottom inset
             to match the @page margin added above — ${HEADER_MARGIN_MM}mm
             of the original 20mm top padding, and ${FOOTER_MARGIN_MM}mm of
             the original 15mm bottom padding, now live in the true page
             margin (top: so a continuation page's repeated <thead> isn't
             flush against the physical edge; bottom: for the footer) instead
             of inside #invoice's own box. minHeight drops by both amounts
             together so the content area's total height on page 1 is
             unchanged and nothing that used to fit on one page suddenly
             doesn't. !important because this needs to beat #invoice's own
             inline style, which ordinary specificity can't do. Screen/
             on-screen preview is untouched — this rule only exists inside
             @media print. */
          #invoice {
            padding-top: ${20 - HEADER_MARGIN_MM}mm !important;
            padding-bottom: ${15 - FOOTER_MARGIN_MM}mm !important;
            min-height: ${pageHeightMm - HEADER_MARGIN_MM - FOOTER_MARGIN_MM}mm !important;
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