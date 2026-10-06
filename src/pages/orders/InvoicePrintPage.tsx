import { balanceDue } from '@/utils/invoiceAmount'
import { useRef, useLayoutEffect, useEffect, useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Receipt, Plus, PackageSearch, X, Highlighter } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp, FormField } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useRekening } from '@/utils/RekeningStore'
import { itemHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useScaleToFit } from '@/hooks/useScaleToFit'
import { usePaperFormat, PAPER_FORMATS, type PaperFormat } from '@/utils/PaperFormatStore'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// The five item-table columns with a natural, content-driven width — every
// one except KETERANGAN, which stays flexible and absorbs whatever width
// the other five don't use (see the column width block below).
type ColumnKey = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

// ─── Multi-page policy ─────────────────────────────────────────────────────
// The document paginates naturally, as printed HTML tables do: <thead> repeats
// on every page, `#invoice tr { page-break-inside: avoid }` keeps rows whole,
// and the closing block (signature/copy/footer) is one unbreakable unit. A
// short invoice prints on one page; a long one takes as many as it needs.
// (An earlier shrink-to-fit-one-page approach, driven by JS measurement,
// broke whenever its guess differed from the print engine.)
const MM_TO_PX = 96 / 25.4
// Base font size, and the floor: text is never shrunk to fit; more content
// means more pages.
// Escapes a string for a CSS `content: "..."` value (the @page footer).
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const BASE_FONT_PX = 14
// The item table's row height (a minimum: a wrapping name still grows its row).
const ROW_HEIGHT_PX = 26
// The print-only running footer's band, taken out of #invoice's bottom padding
// so the page size is unchanged. See the @page rule below.
const FOOTER_MARGIN_MM = 14
// The same at the top. #invoice's padding-top only applies to the first page
// (box fragmentation), so continuation pages would start flush at the edge
// without a real @page top margin.
const HEADER_MARGIN_MM = 19

// ─── Column auto-fit ───────────────────────────────────────────────────────
// The five fixed columns (NO/SIZE/QTY/HARGA NET/JUMLAH) are sized to their
// longest content on every render, measured with a canvas in the table's own
// font, so widths never carry over between invoices.
let measureCanvas: HTMLCanvasElement | null = null
function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return 0
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}
// Measured in bold, the heaviest weight any of these cells uses.
const AUTOFIT_FONT = `bold ${BASE_FONT_PX}px Arial`
// The cells' own padding plus slack: the QTY column also holds an input,
// which clips its text rather than overflowing.
const AUTOFIT_PADDING = 8 + 8 + 6

// Muted pastels for the highlight picker (including the D/P vs Pelunasan sage).
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

// An uppercasing input that keeps the caret where it was.
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

  // setValue resets the field from code (e.g. after adding an item).
  return { value, ref, onChange, setValue }
}

// Keeps the caret in place while thousands separators come and go, by
// restoring how many digits are to its left (as in OrderDetailPage).
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
// A screen-only "PAGE X OF Y" pill on the seam between pages in the preview,
// from the predicted page count. Printing gets the real count from @page.
// `edge`: 'top' pokes out above its box (page 1), 'bottom' below it (inside a
// PageBreakGap).
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
// The gap between two sheets in the preview: a paper-colored bar across the
// full width, the running footer text above it, and a PageFlag on the seam.
// `strong` for a break the user placed; a predicted one is fainter, with a
// caveat. Screen only.
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
  // The D/P row's "paid" label on a Pelunasan invoice: free text, usually LUNAS.
  const dpPaidLabel = useUppercaseField('LUNAS')
  // J/T (due date): filled from invoice.due_date, editable for this printed copy
  // only (e.g. "J/T : SAAT PENGIRIMAN").
  const jatuhTempo = useUppercaseField('')
  const jatuhTempoInitialized = useRef(false)
  // CATATAN lines, editable for this print only (nothing is saved). The bank
  // details are a separate block below.
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
  // Row colors by row key. Clicking a row with the selected swatch paints it;
  // clicking again clears it. The header follows highlightChoice.
  const [rowHighlights, setRowHighlights] = useState<Record<string, string>>({})
  // Rows only take highlight clicks while the Highlight tool is on; existing
  // highlights stay visible either way.
  const [highlightToolActive, setHighlightToolActive] = useState(false)
  const toggleRowHighlight = (key: string) => {
    setRowHighlights(prev => {
      const next = { ...prev }
      if (next[key] === highlightChoice) delete next[key]
      else next[key] = highlightChoice
      return next
    })
  }
  // Click handling and cursor for a highlightable row, in one place.
  const highlightRowHandlers = (key: string) => ({
    onClick: () => { if (highlightToolActive) toggleRowHighlight(key) },
    className: highlightToolActive ? 'cursor-pointer print:cursor-default' : undefined,
  })

  // Manual page breaks, by item group: "start a new page before this group".
  // Groups are never split, so a break can't land inside one.
  const [manualBreaks, setManualBreaks] = useState<Set<string>>(new Set())
  const toggleManualBreak = (name: string) => {
    setManualBreaks(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Extra blank rows under an item group, on top of the one every group gets.
  const [extraGapRows, setExtraGapRows] = useState<Record<string, number>>({})
  const addGapRow = (name: string) => {
    setExtraGapRows(prev => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }))
  }
  const removeGapRow = (name: string) => {
    setExtraGapRows(prev => {
      const current = prev[name] ?? 0
      if (current <= 0) return prev
      return { ...prev, [name]: current - 1 }
    })
  }

  // ─── Natural break prediction ─────────────────────────────────────────
  // The browser decides where pages break, but since groups never split, a
  // break can only fall between groups: forward-filling each group's measured
  // height against the page's content height predicts it. The measurements
  // only drive the continuation notes and page badges, never layout, so the
  // measuring effect settles after one pass.
  const topBlockRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const groupRefs = useRef<Record<string, HTMLTableSectionElement | null>>({})
  const totalsRef = useRef<HTMLTableSectionElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  // The "+ Add note" button is screen-only but sits inside the notes box; its
  // height is subtracted so the notes don't measure taller than they print.
  const addNoteBtnRef = useRef<HTMLButtonElement>(null)
  const closingRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{
    top: number; thead: number; groups: Record<string, number>; totals: number; notes: number; closing: number
  }>({ top: 0, thead: 0, groups: {}, totals: 0, notes: 0, closing: 0 })
  // The measuring effect is further down, after items and the page size exist.

  // A rough page estimate from the item count, used until the first measurement
  // lands. Derived, not measured, so it can't feed back into itself (an earlier
  // measure-then-setState version looped and blanked the page).

  const { data: invoice, isLoading: invoiceLoading, isError: invoiceError, refetch: refetchInvoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  })

  // Fill J/T from the due date once; a later refetch won't overwrite typing.
  useEffect(() => {
    if (jatuhTempoInitialized.current || !invoice) return
    jatuhTempoInitialized.current = true
    jatuhTempo.setValue(
      invoice.due_date ? `J/T : ${format(new Date(invoice.due_date), 'd MMMM yyyy').toUpperCase()}` : ''
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice])

  // Per-invoice, not global — see PaperFormatStore's own comment for why
  // this isn't a shared preference the way column widths are.
  const [paperFormat, setPaperFormat] = usePaperFormat(invoice?.id)
  const { widthMm: pageWidthMm, heightMm: pageHeightMm } = PAPER_FORMATS[paperFormat]
  const pageHeightPx = pageHeightMm * MM_TO_PX

  // Shrinks the preview to fit the screen (never scales up); printing is
  // unaffected.
  const { containerRef: scaleContainerRef, docRef: scaleDocRef, scale, scaledWidth, scaledHeight } = useScaleToFit(true)

  // The Add Row panel is a wide dropdown; on phones it's a modal instead.
  const isMobile = useIsMobile()

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

  // Add Row creates a real item on the order, so it shows up everywhere. A quick
  // one-line form; editing stays on the order's pages.
  const createItem = itemHooks.useCreate()
  // Closed by default, and kept open between adds.
  const [showAddItemPanel, setShowAddItemPanel] = useState(false)
  const newItemName = useUppercaseField('')
  const newItemSize = useUppercaseField('')
  const [newItemAmount, setNewItemAmount] = useState(1)
  const [newItemPrice, setNewItemPrice] = useState(0)
  const newItemPriceField = useFormattedNumberField(newItemPrice, setNewItemPrice)

  // Pick from the client's catalogue, when the order has a client; the fields
  // stay editable.
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
    // Uppercase: the backend merges duplicate items by exact name.
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
          // This page's ['items', order_id] query may not share the list's key: refetch
          // it directly.
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

  // Fixed overhead (masthead, notes, signature) plus a row per item and per gap.
  const groupCount = new Set(items.map(i => i.item_name)).size
  const extraGapRowCount = Object.values(extraGapRows).reduce((s, n) => s + n, 0)
  const rowCount = items.length + groupCount /* gap row per group */ + extraGapRowCount /* user-added extra blank rows */ + 4 /* company + total + dp + pelunasan rows */
  const approxRowPx = ROW_HEIGHT_PX
  const approxOverheadPx = 620 /* masthead + customer detail + notes + signature/footer, roughly */
  const likelyMultiPage = approxOverheadPx + rowCount * approxRowPx > pageHeightPx * 1.05

  // Measures the heights the break prediction needs. Nothing measured feeds
  // back into layout, so it settles.
  useLayoutEffect(() => {
    const groupHeights: Record<string, number> = {}
    Object.entries(groupRefs.current).forEach(([name, el]) => {
      groupHeights[name] = el?.getBoundingClientRect().height ?? 0
    })
    // Leave out the screen-only "+ Add note" button (and its 8px margin).
    const addNoteBtnPx = addNoteBtnRef.current
      ? addNoteBtnRef.current.getBoundingClientRect().height + 8
      : 0
    const next = {
      top: topBlockRef.current?.getBoundingClientRect().height ?? 0,
      thead: theadRef.current?.getBoundingClientRect().height ?? 0,
      groups: groupHeights,
      totals: totalsRef.current?.getBoundingClientRect().height ?? 0,
      notes: Math.max(0, (notesRef.current?.getBoundingClientRect().height ?? 0) - addNoteBtnPx),
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
    // Re-measure when the items or sheet change, not on every render.
  }, [items, pageWidthMm, pageHeightMm, invoice?.id])

  // One grouping for both the table and the page prediction.
  const groups: { name: string; rows: typeof items }[] = []
  items.forEach(item => {
    const g = groups.find(g => g.name === item.item_name)
    if (g) g.rows.push(item)
    else groups.push({ name: item.item_name, rows: [item] })
  })
  const groupNames = groups.map(g => g.name)

  // Predict natural breaks by forward-filling measured heights. Every page loses
  // the @page header and footer bands; page 1 also loses the few mm of
  // #invoice's own padding that didn't move into them.
  const pageMarginPx = (HEADER_MARGIN_MM + FOOTER_MARGIN_MM) * MM_TO_PX
  const firstPageOwnPaddingPx = ((20 - HEADER_MARGIN_MM) + (15 - FOOTER_MARGIN_MM)) * MM_TO_PX
  const firstPageContentPx = pageHeightPx - pageMarginPx - firstPageOwnPaddingPx
  const laterPageContentPx = pageHeightPx - pageMarginPx

  // Before the first measurement every height is 0; the heuristic covers that.
  const hasMeasurements = measured.top > 0 || Object.keys(measured.groups).length > 0
  const predictedBreaks = new Set<string>()
  let predictedTailNewPage = false
  let tailSpillsAt: 'totals' | 'notes' | 'closing' | null = null
  // Screen and print layout differ by a few px per row, and the error grows with
  // the content placed so far. The safety margin is a share of the page already
  // used (18%, deliberately high: a break predicted a little early is harmless;
  // a missed one prints wrong).
  const BASE_SLACK_PX = 24
  const DRIFT_FRACTION = 0.18
  if (hasMeasurements) {
    let remaining = firstPageContentPx - measured.top - measured.thead
    let consumed = measured.top + measured.thead
    groups.forEach((g, i) => {
      const h = measured.groups[g.name] ?? 0
      const driftBuffer = BASE_SLACK_PX + consumed * DRIFT_FRACTION
      // A manual break starts a fresh page: reset the budget and the drift.
      if (i > 0 && manualBreaks.has(g.name)) {
        remaining = laterPageContentPx - measured.thead
        consumed = measured.thead
      } else if (i > 0 && !manualBreaks.has(g.name) && h > 0 && h + driftBuffer > remaining) {
        predictedBreaks.add(g.name)
        remaining = laterPageContentPx - measured.thead
        consumed = measured.thead
      }
      remaining -= h
      consumed += h
    })
    // Totals, notes and the closing block each avoid breaking on their own, so
    // each is checked in turn against what's left, and the first one to spill is
    // where the seam (and the continuation note) goes. The drift margin carries
    // over from the items but doesn't keep growing across these three big,
    // directly measured blocks.
    let tailRemaining = remaining
    let tailDriftBasis = consumed
    ;([['totals', measured.totals], ['notes', measured.notes], ['closing', measured.closing]] as const)
      .forEach(([name, h]) => {
        const driftBuffer = BASE_SLACK_PX + tailDriftBasis * DRIFT_FRACTION
        if (h > 0 && h + driftBuffer > tailRemaining) {
          if (tailSpillsAt === null) tailSpillsAt = name
          tailRemaining = laterPageContentPx
          tailDriftBasis = 0
        }
        tailRemaining -= h
      })
    // Any tail block spilling adds a page.
    predictedTailNewPage = tailSpillsAt !== null
  }

  // Pages as segments of groups, split at manual and predicted breaks, for the
  // markers, the page count and the continuation notes. The table itself stays
  // one flow; the browser still decides where it breaks.
  const pageSegments: { groups: typeof groups }[] = []
  const groupPageNumber = new Map<string, number>()
  groups.forEach((g, i) => {
    if (i > 0 && (manualBreaks.has(g.name) || predictedBreaks.has(g.name))) pageSegments.push({ groups: [g] })
    else if (pageSegments.length === 0) pageSegments.push({ groups: [g] })
    else pageSegments[pageSegments.length - 1].groups.push(g)
    groupPageNumber.set(g.name, pageSegments.length)
  })
  if (pageSegments.length === 0) pageSegments.push({ groups: [] })
  // The tail (totals/notes/signature) predicted onto its own fresh page
  // counts toward the total too, same as a manual/predicted break between
  // two item groups would.
  const totalPredictedPages = pageSegments.length + (predictedTailNewPage ? 1 : 0)
  // One page count for the toolbar pill and every PageFlag: the measured
  // prediction once available, the heuristic before.
  const previewTotalPages = Math.max(
    hasMeasurements ? totalPredictedPages : pageSegments.length,
    likelyMultiPage ? 2 : 1,
  )

  if (invoiceLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // A failed fetch shows Retry, not "Invoice not found".
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

  // Highlight the amount this invoice asks for: D/P on a DP invoice, Pelunasan
  // otherwise. A 0% DP is a full invoice, with no D/P row.
  const isFullInvoice = invoice.type === 'dp' && (invoice.down_payment ?? 0) === 0
  const highlightDp = invoice.type === 'dp' && !isFullInvoice
  const highlightColor = '#d4e6c3'
  // The user-picked header highlight, separate from the automatic D/P vs
  // Pelunasan one.
  const highlightCellStyle = { background: highlightChoice }

  // Each fixed column's content this render, for auto-fit. KETERANGAN takes the
  // remaining width.
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
      balanceDue(invoice).toLocaleString('id-ID'),
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

  // Plain native print; see the multi-page policy at the top.
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar (screen only); wraps on narrow screens. */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Always to the invoice list: this page is often opened directly, with no
           history to go back to. */}
        <button
          onClick={() => navigate('/invoice')}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1 flex items-center gap-1.5">
          {invoice.id}
          {/* "At least": natural overflow can add pages beyond the prediction. */}
          {previewTotalPages > 1 && (
            <span className="badge bg-slate-100 text-slate-600">
              at least {previewTotalPages} page{previewTotalPages === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {/* On/off like the page-break pills. */}
          <button
            type="button"
            onClick={() => setHighlightToolActive(a => !a)}
            title={highlightToolActive ? 'Turn off row highlighting' : 'Highlight rows'}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              highlightToolActive
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Highlighter size={13} /> Highlight
          </button>
          {/* Swatches only while the tool is on. */}
          {highlightToolActive && HIGHLIGHT_PALETTE.map(c => (
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
        {/* Add Row: a toolbar dropdown, so it never pushes the document down. Closed
           only by its own buttons. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddItemPanel(a => !a)}
            title={showAddItemPanel ? 'Close' : 'Add a row to the item table'}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              showAddItemPanel
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Plus size={13} /> Add Row
          </button>
          {showAddItemPanel && isMobile && (
            <Modal title="Add Row" onClose={() => setShowAddItemPanel(false)}>
              <div className="space-y-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="bg-slate-50 rounded-lg px-5 py-4 flex justify-between items-center">
                  <span className="text-base text-slate-500">Subtotal</span>
                  <span className="font-mono font-semibold text-lg">{formatRp(newItemAmount * newItemPrice)}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={createItem.isPending || !newItemName.value.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-1.5 !py-3 !text-base"
                >
                  <Plus size={14} /> {createItem.isPending ? 'Adding…' : 'Add Row'}
                </button>
              </div>
            </Modal>
          )}
          {showAddItemPanel && !isMobile && (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute right-0 mt-2 w-[28rem] space-y-5 bg-white border border-slate-200 rounded-lg shadow-lg p-6 z-20"
            >
              <div className="flex justify-between items-center">
                <span className="text-base font-semibold text-slate-700">Add Row</span>
                <button
                  type="button"
                  onClick={() => setShowAddItemPanel(false)}
                  className="btn-ghost btn-sm !px-1.5"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="bg-slate-50 rounded-lg px-5 py-4 flex justify-between items-center">
                <span className="text-base text-slate-500">Subtotal</span>
                <span className="font-mono font-semibold text-lg">{formatRp(newItemAmount * newItemPrice)}</span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={createItem.isPending || !newItemName.value.trim()}
                className="btn-primary w-full flex items-center justify-center gap-1.5 !py-3 !text-base"
              >
                <Plus size={14} /> {createItem.isPending ? 'Adding…' : 'Add Row'}
              </button>
            </div>
          )}
        </div>
        {/* Paper format, saved per invoice (PaperFormatStore); sets both the printed
           @page size and the preview. */}
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

      {/* Manual page breaks, when there's more than one item group. */}
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

      {/* The page is a fixed physical width: it scrolls here (and .scale-wrap shrinks
         it to fit) so it doesn't widen the toolbar. Printing uses the real size. */}
      <div className="p-8 print:p-0 overflow-x-auto print:overflow-visible" ref={scaleContainerRef}>
        <div
          className="scale-wrap"
          style={{ width: scaledWidth || undefined, height: scaledHeight || undefined, overflow: 'hidden' }}
        >
        <div
          id="invoice-page-wrap"
          ref={scaleDocRef}
          style={{
            width: `${pageWidthMm}mm`,
            position: 'relative',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className="mx-auto"
        >
          {/* Page 1's badge sits at the sheet's top-right corner. */}
          <PageFlag page={1} total={previewTotalPages} />
          <div
            id="invoice"
            className="bg-white shadow-lg print:shadow-none"
            style={{
              // border-box: width and minHeight are the sheet's outer size (otherwise the
              // padding makes it taller than A4 and spills onto a second page). Print uses
              // smaller top/bottom padding; see @media print.
              boxSizing: 'border-box',
              width: `${pageWidthMm}mm`,
              minHeight: `${pageHeightMm}mm`,
              padding: '20mm 20mm 15mm 20mm',
              fontFamily: 'Arial, sans-serif',
              fontSize: `${BASE_FONT_PX}px`,
              color: '#000',
            }}
          >
          {/* Everything above the item table, measured as one block for the prediction. */}
          <div ref={topBlockRef}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img src="/Logo.png" alt="KMA Logo" style={{ width: '80px', height: 'auto', marginBottom: '6px' }} />
              <div style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}>KREASI  MAKMUR  ABADI</div>
            </div>
            {/* The company's contact block, as in the footer. Fixed text; NPWP is left out
               until there's a real number. */}
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
          {/* table-layout fixed makes the auto-fit <th> widths authoritative. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: `${BASE_FONT_PX}px`, tableLayout: 'fixed' }}>
            <thead ref={theadRef}>
              {/* Darker column dividers, visible on the highlight fill. */}
              <tr style={highlightCellStyle}>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.no}px`, whiteSpace: 'nowrap' }}>
                  NO.
                </th>
                {/* KETERANGAN takes the remaining width and may wrap (long item names). */}
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left' }}>KETERANGAN</th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.size}px`, whiteSpace: 'nowrap' }}>
                  SIZE
                </th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', width: `${columnWidths.qty}px`, whiteSpace: 'nowrap' }}>
                  QTY
                </th>
                {/* Fitted to the longest amount; no ellipsis, so a sizing bug would show. */}
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.hargaNet}px`, whiteSpace: 'nowrap' }}>
                  HARGA NET
                </th>
                <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: `${columnWidths.jumlah}px`, whiteSpace: 'nowrap' }}>
                  JUMLAH (Rp)
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Company name row: a label row, unnumbered, highlightable. */}
              <tr
                {...highlightRowHandlers('company')}
                style={{ background: rowHighlights['company'] }}
              >
                {/* A minimum height, so rows of empty cells match rows with text. */}
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, fontWeight: 'bold', fontStyle: 'italic' }}>
                  {invoice.kepada_yth.toUpperCase()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
              </tr>

              {/* Item rows, grouped by name (sizes together), numbered on each group's first row. */}
            </tbody>

            {/* Each group is its own <tbody> so pageBreakInside: avoid keeps its rows
               together (unless the group is taller than a page). */}
            {groups.map((group, groupIdx) => {
              // A manual break forces page-break-before; a predicted one only drives the
              // notes and markers (forcing it would make the guess come true).
              const manualBreakHere = manualBreaks.has(group.name) && groupIdx > 0
              const predictedBreakHere = !manualBreakHere && predictedBreaks.has(group.name) && groupIdx > 0
              const showBreakMarker = manualBreakHere
              const endOfPageLabel = groupPageNumber.get(group.name)! - 1
              const startOfPageLabel = groupPageNumber.get(group.name)
              // Whether this group ends its page (the next one breaks), so the page can
              // print "(continued on next page)" at its bottom.
              const nextGroup = groups[groupIdx + 1]
              // The last group's page ends early if the tail is predicted to spill.
              const isLastGroup = groupIdx === groups.length - 1
              const endsPageHere = nextGroup
                ? (manualBreaks.has(nextGroup.name) || predictedBreaks.has(nextGroup.name))
                : (isLastGroup && tailSpillsAt === 'totals')

              return (
                <Fragment key={group.name}>
                  {/* Screen-only markers live in their own tbody so they're never measured as content. */}
                  {(showBreakMarker || predictedBreakHere) && (
                    <tbody>
                      {/* A manual break, drawn as a real page edge with page labels (screen only). */}
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
                      {/* A predicted break: a lighter dashed hint (screen only). */}
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
                    </tbody>
                  )}
                  <tbody
                    ref={el => { groupRefs.current[group.name] = el }}
                    style={{
                      pageBreakInside: 'avoid',
                      // On the whole tbody, the same unit pageBreakInside protects; never before the
                      // first group.
                      ...(manualBreakHere
                        ? { pageBreakBefore: 'always', breakBefore: 'page' }
                        : {}),
                    }}
                  >
                    {/* No "continued from previous page": the note at the bottom of the previous
                       page already says so. */}
                    {group.rows.map((item, rowIdx) => {
                    const key = `item-${item.id}`
                    return (
                      <tr
                        key={key}
                        {...highlightRowHandlers(key)}
                        style={{ background: rowHighlights[key] }}
                      >
                        {/* A minimum height here too. */}
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {rowIdx === 0 ? groupIdx + 1 : ''}
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }}>{rowIdx === 0 ? item.item_name.toUpperCase() : ''}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.size ?? '—'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'center', whiteSpace: 'nowrap' }}>{item.amount.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.price.toLocaleString('id-ID')}</td>
                        <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.sub_total.toLocaleString('id-ID')}</td>
                      </tr>
                    )
                  })}
                  {/* A gap row after every group, as tall as an item row and highlightable. */}
                  {(() => {
                    const extra = extraGapRows[group.name] ?? 0
                    const totalGapRows = 1 + extra
                    return Array.from({ length: totalGapRows }, (_, gapIdx) => {
                      const key = `gap-${group.name}-${gapIdx}`
                      const isLastGapRow = gapIdx === totalGapRows - 1
                      const cellStyle = { border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, background: rowHighlights[key] }
                      return (
                        <tr key={key} {...highlightRowHandlers(key)}>
                          <td style={cellStyle} />
                          <td style={cellStyle} />
                          <td style={cellStyle} />
                          <td style={cellStyle} />
                          <td style={cellStyle} />
                          {/* +/- for extra gap rows, in the group's last gap row (screen only). */}
                          <td style={cellStyle}>
                            {isLastGapRow && (
                              <div
                                className="print:hidden"
                                onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}
                              >
                                {extra > 0 && (
                                  <button
                                    type="button"
                                    title="Remove blank row"
                                    onClick={() => removeGapRow(group.name)}
                                    style={{ border: '1px solid #cbd5e1', borderRadius: '4px', width: '18px', height: '18px', lineHeight: 1, fontSize: '12px', color: '#64748b', background: 'white', cursor: 'pointer' }}
                                  >
                                    −
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Add blank row"
                                  onClick={() => addGapRow(group.name)}
                                  style={{ border: '1px solid #cbd5e1', borderRadius: '4px', width: '18px', height: '18px', lineHeight: 1, fontSize: '12px', color: '#64748b', background: 'white', cursor: 'pointer' }}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                  {/* Printed at the bottom of a page that ends early, so the reader knows more
                     follows. */}
                  {endsPageHere && (
                    <tr className="continuation-note">
                      <td colSpan={6} style={{ padding: '10px 8px 0', textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', borderTop: 'none', borderBottom: 'none' }}>
                        (continued on next page)
                      </td>
                    </tr>
                  )}
                  </tbody>
                </Fragment>
              )
            })}

            {/* The seam when only the totals spill onto a new page (no group boundary to
               mark it). Only for 'totals': notes or closing spilling have their own
               markers further down. */}
            {tailSpillsAt === 'totals' && (
              <tbody className="print:hidden">
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <PageBreakGap
                      endPage={pageSegments.length}
                      startPage={pageSegments.length + 1}
                      total={previewTotalPages}
                      invoiceId={invoice.id}
                      client={invoice.kepada_yth}
                      strong={false}
                    />
                  </td>
                </tr>
              </tbody>
            )}

            {/* TOTAL / D.P / PELUNASAN in one tbody, never split. */}
            <tbody ref={totalsRef} style={{ pageBreakInside: 'avoid' }}>
              {/* Total row */}
              <tr
                {...highlightRowHandlers('total')}
                style={{ background: rowHighlights['total'] }}
              >
                {/* Blank spacer over NO/KETERANGAN/SIZE: the top border closes the item table;
                   the bottom one is 'hidden' so border-collapse can't draw it. */}
                <td style={{ padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, borderTop: '1px solid #ccc', borderBottomStyle: 'hidden' }} colSpan={3} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  {items.reduce((s, i) => s + i.amount, 0).toLocaleString('id-ID')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>TOTAL</td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  {invoice.total.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* D/P row. Clicking overrides its automatic highlight with the selected
                 swatch; the same swatch again restores it. */}
              {invoice.down_payment != null && invoice.down_payment > 0 ? (
                <tr {...highlightRowHandlers('dp')}>
                  {/* Blank spacer, borders hidden as above. */}
                  <td style={{ padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, borderTopStyle: 'hidden', borderBottomStyle: 'hidden' }} colSpan={3} />
                  {/* A typable LUNAS label, only on a Pelunasan invoice (the D/P is paid by then).
                     Auto-fit sizes the QTY column to it. */}
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
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
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    D/P {dpPercent} %
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['dp'] ?? (highlightDp ? highlightColor : undefined) }}>
                    {(invoice.down_payment ?? 0).toLocaleString('id-ID')}
                  </td>
                </tr>
              ) : (
                // No D/P to show (full invoice, or a Pelunasan with no DP): PELUNASAN sits
                // directly under TOTAL.
                null
              )}

              {/* Pelunasan row — same click-to-override behavior as DP above. */}
              <tr {...highlightRowHandlers('pelunasan')}>
                <td style={{ padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', borderTopStyle: 'hidden', borderBottomStyle: 'hidden' }} colSpan={3}>
                  {/* J/T (due date), editable for this printed copy only. */}
                  <input
                    ref={jatuhTempo.ref}
                    value={jatuhTempo.value}
                    onChange={jatuhTempo.onChange}
                    onClick={e => e.stopPropagation()}
                    placeholder="J/T : —"
                    style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: `${BASE_FONT_PX}px`, textAlign: 'right', width: '100%', padding: 0 }}
                  />
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px` }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  PELUNASAN
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', height: `${ROW_HEIGHT_PX}px`, textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', background: rowHighlights['pelunasan'] ?? (!highlightDp ? highlightColor : undefined) }}>
                  {/* The balance after discount (see balanceDue). */}
                  {balanceDue(invoice).toLocaleString('id-ID')}
                </td>
              </tr>
              {/* The note for a seam after PELUNASAN, when the notes and closing spill. */}
              {tailSpillsAt === 'notes' && (
                <tr className="continuation-note">
                  <td colSpan={6} style={{ padding: '10px 8px 0', textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', border: 'none' }}>
                    (continued on next page)
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* The screen marker for that same seam. */}
          {tailSpillsAt === 'notes' && (
            <PageBreakGap
              endPage={pageSegments.length}
              startPage={pageSegments.length + 1}
              total={previewTotalPages}
              invoiceId={invoice.id}
              client={invoice.kepada_yth}
              strong={false}
            />
          )}

          {/* Notes, spaced a little tighter to help them fit on page 1. A fixed amount on
             purpose: nothing measured feeds back into it. */}
          <div ref={notesRef} style={{ marginTop: '18px', fontSize: `${BASE_FONT_PX}px`, pageBreakInside: 'avoid' }}>
            <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '4px' }}>SYARAT & KETENTUAN :</div>
            <ol style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.5' }}>
              {notes.map((note, idx) => (
                // An empty line stays editable on screen but doesn't print as a bare number.
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
              ref={addNoteBtnRef}
              type="button"
              onClick={addNote}
              className="print:hidden btn-secondary flex items-center gap-1.5"
              style={{ marginTop: '8px', fontSize: '12px', padding: '4px 10px' }}
            >
              <Plus size={12} /> Add note
            </button>

            {/* Bank details in their own box (shared with the kwitansi via useRekening). */}
            <div style={{ marginTop: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
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

          {/* Same "(continued on next page)" treatment as the two seams
              above, for when totals AND notes both print fine and it's
              only the closing block (signature/footer) that spills. */}
          {tailSpillsAt === 'closing' && (
            <>
              <div style={{ textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', marginTop: '8px' }}>
                (continued on next page)
              </div>
              <PageBreakGap
                endPage={pageSegments.length}
                startPage={pageSegments.length + 1}
                total={previewTotalPages}
                invoiceId={invoice.id}
                client={invoice.kepada_yth}
                strong={false}
              />
            </>
          )}

          {/* Signature and footer: one unbreakable unit, placed by natural flow. */}
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

          {/* Preview of the last page's footer (earlier pages show theirs in their gap). */}
          {previewTotalPages > 1 && (
            <div className="print:hidden" style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '10px', color: '#94a3b8', padding: '10px 0 0',
            }}>
              <span>Page {previewTotalPages} of {previewTotalPages}</span>
              <span>INVOICE {invoice.id} — {invoice.kepada_yth}</span>
            </div>
          )}

          {/* The running footer is in @page margin boxes; see the print styles. */}
          </div>
        </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        /* The print-only "(continued on next page)" row: hidden on screen, shown in
           @media print below. */
        .continuation-note { display: none; }

        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .continuation-note { display: table-row !important; }
          /* Undo the on-screen scaling when printing. */
          .scale-wrap { width: auto !important; height: auto !important; overflow: visible !important; }
          #invoice-page-wrap { transform: none !important; }

          /* Only the top and bottom margins come from @page (taken out of #invoice's
             padding below); left/right padding already repeats on every page. Two
             earlier attempts at all-four-sides @page margins printed edge to edge in
             this setup, so check a real multi-page print after changing this. To
             revert: margin 0 here, drop the margin boxes and the #invoice override. */
          @page {
            size: ${pageWidthMm}mm ${pageHeightMm}mm;
            margin: ${HEADER_MARGIN_MM}mm 0 ${FOOTER_MARGIN_MM}mm 0;
            /* Page X of Y: counter(pages) only works in an @page margin box. */
            @bottom-left {
              content: "Page " counter(page) " of " counter(pages);
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #94a3b8;
              /* Inset like #invoice's 20mm side padding, centered in the footer band. */
              padding: 0 0 0 20mm;
              vertical-align: middle;
            }
            /* Invoice number and client, on the same footer line. */
            @bottom-right {
              content: "INVOICE ${escapeCssString(invoice.id)} — ${escapeCssString(invoice.kepada_yth)}";
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #94a3b8;
              /* Inset 20mm from the right, like the left half. */
              padding: 0 20mm 0 0;
              vertical-align: middle;
            }
          }

          /* Print only: the top and bottom padding that moved into the @page margins,
             with minHeight reduced to match. !important to beat the inline style. */
          #invoice {
            padding-top: ${20 - HEADER_MARGIN_MM}mm !important;
            padding-bottom: ${15 - FOOTER_MARGIN_MM}mm !important;
            min-height: ${pageHeightMm - HEADER_MARGIN_MM - FOOTER_MARGIN_MM}mm !important;
          }

          /* Print background colors (highlights) without the "Background graphics" option. */
          #invoice, #invoice * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* Never slice a row across pages. */
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