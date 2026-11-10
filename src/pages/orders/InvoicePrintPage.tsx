import { liveDownPayment as resolveLiveDownPayment, balanceDue } from '@/utils/invoiceAmount'
import { useRef, useLayoutEffect, useEffect, useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n/config'
import { friendlyError } from '@/utils/friendlyError'
import { parseDate } from '@/utils/tableText'
import type { Invoice, Item } from '@/types'
import { ArrowLeft, Printer, Receipt, Plus, PackageSearch, X, Highlighter, Rows3 } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp, FormField, ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useRekening } from '@/utils/RekeningStore'
import { itemHooks, clientItemHooks, clientItemPriceHooks, invoiceHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useScaleToFit } from '@/hooks/useScaleToFit'
import { usePrintLightBody } from '@/hooks/usePrintLightBody'
import { usePaperFormat, PAPER_FORMATS, type PaperFormat } from '@/utils/PaperFormatStore'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// The five item-table columns with a natural, content-driven width — every
// one except KETERANGAN, which stays flexible and absorbs whatever width
// the other five don't use (see the column width block below).
type ColumnKey = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

// ─── Multi-page policy ─────────────────────────────────────────────────────
// The document paginates naturally, as printed HTML tables do: <thead> repeats
// on every page, `#invoice tr { page-break-inside: avoid }` keeps rows whole,
// and the notes (SYARAT & KETENTUAN) and closing block (signature/copy/footer)
// are wrapped together as one unbreakable unit, so the signature never prints
// alone on a page by itself. A short invoice prints on one page; a long one
// takes as many as it needs.
// (An earlier shrink-to-fit-one-page approach, driven by JS measurement,
// broke whenever its guess differed from the print engine.)
const MM_TO_PX = 96 / 25.4
// Base font size, and the floor: text is never shrunk to fit; more content
// means more pages.
// Escapes a string for a CSS `content: "..."` value (the @page footer).
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const BASE_FONT_PX = 11.5
// The item table's row height (a minimum: a wrapping name still grows its row).
const ROW_HEIGHT_PX = 14
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

// "11 APRIL 2019", as KMA's own invoices write it.
function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-'
  return format(new Date(date), 'd MMMM yyyy').toUpperCase()
}

// The look of KMA's own Excel invoice: a serif for the title, notes and
// signature labels, Arial for everything else, a dark blue title.
const SERIF = "Cambria, Georgia, 'Times New Roman', serif"
const TITLE_BLUE = '#1f4e79'
const FRAME = '1.5px solid #000'
const LINE = '1px solid #000'
const ROW_LINE = '1px solid #c8c8c8'
const num = (n: number) => n.toLocaleString('en-US')

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

// ─── Spreadsheet cell ──────────────────────────────────────────────────────
// A cell of the invoice that works like one in Excel, while printing as
// plain text: click (or arrow/Tab to it) to select; typing replaces what's
// there, Enter or F2 (or a double-click) edits it; Enter saves and moves
// down, Tab right, Esc cancels. On a touch screen a tap edits straight away.
// Numbers show with thousands commas and are typed as plain digits.
type SheetMove = (rowDelta: number, colDelta: number) => void

function SheetCell({ value, onSave, numeric = false, align = 'left', placeholder, cellRef, onMove, bold = false, uppercase = true }: {
  value: string | number
  onSave: (value: string) => void
  numeric?: boolean
  align?: 'left' | 'center' | 'right'
  /** Shown on screen only, in an empty cell (e.g. "+ size"). */
  placeholder?: string
  cellRef?: (el: HTMLElement | null) => void
  onMove?: SheetMove
  bold?: boolean
  uppercase?: boolean
}) {
  const shown = numeric ? (value === '' || value == null ? '' : num(Number(value))) : String(value ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const displayRef = useRef<HTMLDivElement | null>(null)
  // Where focus goes once an edit ends: back to this cell, unless the edit
  // ended by moving to another one (Enter, Tab, arrows) or clicking away.
  const refocus = useRef(false)

  // One edit saves once: Enter (or Tab, an arrow) saves and moves on, and the
  // blur that moving causes must not save it a second time.
  const settled = useRef(true)
  const begin = (start: string) => { settled.current = false; setDraft(start); setEditing(true) }
  const clean = (v: string) => (numeric ? v.replace(/[^\d]/g, '') : uppercase ? v.toUpperCase() : v)
  const commit = () => {
    if (settled.current) return
    settled.current = true
    setEditing(false)
    const next = clean(draft).trim()
    if (next !== String(value ?? '').trim()) onSave(next)
  }

  // Not typing: the cell is selected text that moves, starts an edit, or clears.
  const onDisplayKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) { e.preventDefault(); onMove?.(...moves[e.key]); return }
    if (e.key === 'Tab') { e.preventDefault(); onMove?.(0, e.shiftKey ? -1 : 1); return }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); refocus.current = true; begin(numeric ? String(value ?? '') : shown); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); refocus.current = true; begin(''); return }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); refocus.current = true; begin(e.key) }
  }
  // Typing: Enter saves and moves down, Tab right, Esc cancels.
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); refocus.current = false; commit()
      onMove?.(e.key === 'Tab' ? 0 : e.shiftKey ? -1 : 1, e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0)
    } else if (e.key === 'Escape') {
      e.preventDefault(); refocus.current = true; settled.current = true; setEditing(false)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); refocus.current = false; commit(); onMove?.(e.key === 'ArrowUp' ? -1 : 1, 0)
    }
  }

  // Before paint, so the next keystrokes of fast typing land in the input.
  useLayoutEffect(() => {
    if (editing) {
      const el = inputRef.current
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
    } else if (refocus.current) {
      refocus.current = false
      displayRef.current?.focus()
    }
  }, [editing])

  if (editing) {
    return (
      <input
        ref={el => { inputRef.current = el }}
        className="sheet-cell sheet-editing"
        value={draft}
        inputMode={numeric ? 'numeric' : undefined}
        onChange={e => setDraft(clean(e.target.value))}
        onKeyDown={onInputKey}
        onClick={e => e.stopPropagation()}
        onBlur={() => { if (editing) { refocus.current = false; commit() } }}
        style={{ textAlign: align, fontWeight: bold ? 'bold' : undefined }}
      />
    )
  }
  // Shown as text, so a long KETERANGAN wraps onto a second line on paper
  // the way it does in Excel (a one-line input would cut it off).
  return (
    <div
      ref={el => { displayRef.current = el; cellRef?.(el) }}
      className="sheet-cell"
      tabIndex={0}
      role="textbox"
      aria-readonly="true"
      onKeyDown={onDisplayKey}
      onDoubleClick={() => begin(numeric ? String(value ?? '') : shown)}
      onClick={e => {
        e.stopPropagation()
        // No keyboard on a phone to start typing with: a tap edits.
        if (window.matchMedia('(pointer: coarse)').matches) begin(numeric ? String(value ?? '') : shown)
      }}
      style={{ textAlign: align, fontWeight: bold ? 'bold' : undefined, cursor: 'cell', whiteSpace: 'normal', wordBreak: 'break-word' }}
    >
      {shown || (placeholder ? <span className="sheet-ph">{placeholder}</span> : '\u00a0')}
    </div>
  )
}

/** Rows pasted from Excel: KETERANGAN, SIZE, QTY, HARGA (an ITEM number in
 *  front and a JUMLAH after are allowed and ignored). A blank KETERANGAN
 *  belongs to the item above, as on the invoice; "-" and empty rows are
 *  skipped. */
function parsePastedItems(text: string): { item_name: string; size: string; amount: number; price: number }[] {
  const rows = text.replace(/\r/g, '').split('\n').map(l => l.split('\t').map(c => c.trim())).filter(r => r.some(c => c && c !== '-'))
  const digits = (v: string | undefined) => Number((v ?? '').replace(/[^\d]/g, '')) || 0
  const out: { item_name: string; size: string; amount: number; price: number }[] = []
  let lastName = ''
  for (const r0 of rows) {
    let r = r0
    // A leading item number (1, 2, 3…) when the row has room for one.
    if (r.length >= 5 && /^\d{0,3}$/.test(r[0])) r = r.slice(1)
    const [name, size, qty, price] = r
    if (/^(ITEM|KETERANGAN|TOTAL|D\/P|PELUNASAN|LUNAS)/i.test(name ?? '')) continue
    const itemName = (name || lastName).toUpperCase()
    if (!itemName) continue
    lastName = itemName
    const amount = digits(qty), unitPrice = digits(price)
    if (!amount && !unitPrice) continue
    out.push({ item_name: itemName, size: (size ?? '').toUpperCase(), amount, price: unitPrice })
  }
  return out
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
  usePrintLightBody()
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')
  const { rekening, setRekening } = useRekening()
  const signatoryName = useUppercaseField('FIFI LESMANA')
  const signatoryTitle = useUppercaseField('FOUNDER')
  // The D/P row's "paid" label on a Pelunasan invoice: free text, usually LUNAS.
  const dpPaidLabel = useUppercaseField('LUNAS')
  // A free note beside TOTAL (the Excel's "* khusus"), for this print only.
  const [totalNote, setTotalNote] = useState('')
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

  // Compact: tightens row height, font size, and the gaps between blocks, so
  // an invoice sitting just over one page — mostly whitespace, not real
  // overflow — often fits on it. A manual, user-toggled choice rather than
  // an auto-computed "scale to exactly fit": the multi-page policy note
  // above already covers why that broke (the JS guess and the print
  // engine's own layout disagreeing); tightening a few fixed values is far
  // more predictable than solving for an exact scale factor, and the user
  // can see right away whether it was enough.
  // Fixed tightening, superseded by "Fit to 1 page" below; kept as a
  // constant so the spacing code keeps one place to change.
  const compact = false
  // Fit to 1 page: when the invoice is a little too tall for one page, the
  // whole of it is scaled down evenly (CSS zoom, which prints the same as it
  // shows) by exactly what it takes, rather than squeezing a few gaps by a
  // fixed amount (which left an invoice that already fitted with a big gap
  // after the signatures, and a long one still on two pages). Never below
  // 70%: past that the text gets too small, and it prints on more pages.
  const [fitOnePage, setFitOnePage] = useState(true)
  const [fitZoom, setFitZoom] = useState(1)
  const [tooLongForOnePage, setTooLongForOnePage] = useState(false)
  // Whether it fits one page at full size (measured as printed, see measureFit).
  const [fitsAtFullSize, setFitsAtFullSize] = useState<boolean | null>(null)
  const fitBodyRef = useRef<HTMLDivElement>(null)
  const [manualBreaks, setManualBreaks] = useState<Set<string>>(new Set())
  // Fit to 1 page sets the real sizes (font, rows, gaps, logo, title,
  // signing space) to this fraction rather than zooming the page: a zoom
  // wasn't applied to typed-over text boxes on paper and measured
  // differently from the printout, so the preview and the print disagreed.
  // Real sizes lay out the same on screen and on paper.
  const fitActive = fitOnePage && manualBreaks.size === 0
  const fit = fitActive ? fitZoom : 1
  const sz = (px: number) => Math.round(px * fit * 100) / 100
  const fontPx = sz(compact ? 10 : BASE_FONT_PX)
  const rowPx = sz(compact ? 14 : ROW_HEIGHT_PX)
  // Every table cell's own padding (6px 8px normally) sits on top of its
  // row's height in content-box sizing, so it's a real, separate lever —
  // left alone, it alone would cap how much a row could ever shrink.
  const cellPad = `${sz(1)}px 6px`
  // Scales a block-spacing value (margins between sections — the biggest
  // source of "whitespace" on a near-miss page) to 40% when compact.
  const tightMargin = (px: number) => sz(compact ? Math.round(px * 0.4) : px)
  // A blank gap row's +/- controls must fit inside the same height budget
  // as every other cell in that row (rowPx minus the cell's own vertical
  // padding) — a fixed 18px button no longer fit once compact mode shrank
  // the row, which was forcing that one row taller than its neighbors.
  const gapCtrlSize = Math.max(10, rowPx - 6)

  // Manual page breaks, by item group: "start a new page before this group".
  // Groups are never split, so a break can't land inside one.
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

  // All invoices, so liveDownPayment/balanceDue below can find this order's DP
  // invoice by order_id. A Pelunasan's own down_payment is a snapshot from
  // when it was created (or last saved) — if the DP invoice is corrected
  // afterwards, this live lookup is what keeps the printed D/P and Sisa
  // figures in sync instead of printing the stale snapshot (same live-lookup
  // pattern KwitansiPrintPage uses).
  const { data: allInvoices = [] } = invoiceHooks.useList()

  // ─── The invoice as a spreadsheet ─────────────────────────────────────
  // Typing into the table changes the order's real items (so the order
  // page, kwitansi and finance agree with what's printed), and every invoice
  // of the order is then brought in line with the new total: an unpaid DP
  // keeps its percentage, a paid DP keeps its amount, and what's left is the
  // total less the DP and any discount — the same sums the invoice form does.
  const qc = useQueryClient()
  const [sheetBusy, setSheetBusy] = useState(false)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<Item | null>(null)
  const sheetCells = useRef(new Map<string, HTMLElement>())
  const sheetRef = (row: number, col: number) => (el: HTMLElement | null) => {
    const key = `${row}:${col}`
    if (el) sheetCells.current.set(key, el)
    else sheetCells.current.delete(key)
  }
  // Moves to the nearest cell in that direction, skipping gaps (a row with
  // fewer editable cells).
  const sheetMove = (row: number, col: number): SheetMove => (dr, dc) => {
    let r = row + dr, c = Math.min(3, Math.max(0, col + dc))
    for (let i = 0; i < 400; i++) {
      const el = sheetCells.current.get(`${r}:${c}`)
      if (el) { el.focus(); return }
      if (dr) r += dr
      else if (dc) { c += dc; if (c < 0 || c > 3) return }
      else return
      if (r < 0 || r > 400) return
    }
  }

  const syncInvoiceTotals = async (orderId: string) => {
    const fresh = await itemsApi.getByOrder(orderId)
    const total = fresh.reduce((n, i) => n + (i.sub_total ?? i.amount * i.price), 0)
    // Fresh, not the list loaded with the page: an earlier edit may have changed them.
    const own = (await invoicesApi.list()).filter((i: Invoice) => i.order_id === orderId)
    const dpInv = own.find(i => i.type === 'dp')
    const dpAmount = (() => {
      if (!dpInv) return 0
      const dp = dpInv.down_payment ?? 0
      if (dp === 0) return 0
      if (dpInv.status === 'paid' || !dpInv.total) return Math.min(dp, total)
      return Math.round(total * (dp / dpInv.total))
    })()
    for (const inv of own) {
      const dp = inv.type === 'dp' || dpInv ? dpAmount : (inv.down_payment ?? 0)
      const remaining = total - dp
      const ar = Math.max(0, remaining - (inv.discount ?? 0))
      if (inv.total !== total || (inv.down_payment ?? 0) !== dp || inv.remaining !== remaining || inv.ar_receivable !== ar) {
        await invoicesApi.update(inv.id, { total, down_payment: dp, remaining, ar_receivable: ar })
      }
    }
  }

  const sheetEdit = async (work: () => Promise<void>, done?: string, sync = true) => {
    if (!invoice) return
    setSheetBusy(true)
    try {
      await work()
      if (sync) await syncInvoiceTotals(invoice.order_id)
      await Promise.all([
        refetchItems(),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['invoice', invoice.id] }),
        qc.invalidateQueries({ queryKey: ['items'] }),
      ])
      if (done) toast.success(done)
    } catch (e) {
      toast.error(friendlyError(e as Error))
    } finally {
      setSheetBusy(false)
    }
  }

  // One cell of an item row. A name typed on a group's first row renames
  // the whole group (all its sizes); typed on another row, just that row.
  const saveItemCell = (item: Item, field: 'name' | 'size' | 'qty' | 'price', raw: string, wholeGroup: Item[] | null) =>
    sheetEdit(async () => {
      if (field === 'name') {
        const name = raw.trim().toUpperCase()
        if (!name) return
        for (const it of wholeGroup ?? [item]) await itemsApi.update(it.id, { item_name: name })
        return
      }
      if (field === 'size') { await itemsApi.update(item.id, { size: raw.trim().toUpperCase() }); return }
      const amount = field === 'qty' ? Number(raw) || 0 : item.amount
      const price = field === 'price' ? Number(raw) || 0 : item.price
      await itemsApi.update(item.id, { amount, price, sub_total: amount * price })
    })

  // A blank row: what's typed into it becomes a new line, under the item
  // above it (a new size) or, with a KETERANGAN typed, a new item.
  const saveBlankCell = (groupName: string | null, field: 'name' | 'size' | 'qty' | 'price', raw: string) => {
    if (!invoice) return
    const v = raw.trim()
    if (!v) return
    const name = field === 'name' ? v.toUpperCase() : groupName
    if (!name) return void toast.error(t('invoiceSheet.nameFirst'))
    const amount = field === 'qty' ? Number(v) || 0 : 0
    const price = field === 'price' ? Number(v) || 0 : 0
    return sheetEdit(async () => {
      await itemsApi.create({ order_id: invoice.order_id, item_name: name, size: field === 'size' ? v.toUpperCase() : '', amount, price, sub_total: amount * price })
    })
  }

  const deleteItemRow = (item: Item) => sheetEdit(async () => { await itemsApi.delete(item.id) }, t('invoiceSheet.rowDeleted', { name: item.item_name }))

  // Rows copied from Excel and pasted anywhere on the table (outside a cell
  // being typed in) are added as new lines, with an Undo.
  const onSheetPaste = (e: React.ClipboardEvent) => {
    if (!invoice) return
    // Pasting into a cell being typed in is ordinary text pasting.
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(text)) return
    const rows = parsePastedItems(text)
    if (!rows.length) return
    e.preventDefault()
    const before = new Set(items.map(i => i.id))
    const created: number[] = []
    sheetEdit(async () => {
      for (const r of rows) {
        const it = await itemsApi.create({ order_id: invoice.order_id, ...r, sub_total: r.amount * r.price })
        if (it && !before.has(it.id)) created.push(it.id)
      }
    }).then(() => {
      toast.success(t => (
        <span className="flex items-center gap-3">
          {i18n.t('invoiceSheet.pasted', { count: rows.length })}
          {created.length > 0 && (
            <button className="font-semibold underline" onClick={() => {
              toast.dismiss(t.id)
              sheetEdit(async () => { for (const id of created) await itemsApi.delete(id) }, i18n.t('invoiceSheet.pasteUndone'))
            }}>{i18n.t('common.undo')}</button>
          )}
        </span>
      ), { duration: 8000 })
    })
  }

  // The header, typed in place and saved to the invoice (PO No. to the order).
  const saveInvoiceField = (field: 'kepada_yth' | 'untuk' | 'alamat' | 'telp' | 'email' | 'lama_produksi' | 'start_produksi' | 'tanggal', raw: string) => {
    if (!invoice) return
    let value: string | null = raw.trim()
    if (field === 'tanggal') {
      const iso = parseDate(value)
      if (!iso) return void toast.error(t('invoiceSheet.badDate'))
      value = iso
    }
    if (field === 'kepada_yth' && !value) return void toast.error(t('invoiceSheet.needClient'))
    if (value === '' && field !== 'kepada_yth' && field !== 'untuk' && field !== 'alamat') value = null
    // Header details don't change any amount, so no totals to bring in line.
    sheetEdit(async () => { await invoicesApi.update(invoice.id, { [field]: value }) }, undefined, false)
  }
  const savePoNumber = (raw: string) => {
    if (!order) return
    sheetEdit(async () => {
      await ordersApi.update(order.id, { po_number: raw.trim().toUpperCase() || null })
      await qc.invalidateQueries({ queryKey: ['order', order.id] })
    }, undefined, false)
  }

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
  const rowCount = items.length + groupCount /* gap row per group */ + extraGapRowCount /* user-added extra blank rows */ + 3 /* total + dp + pelunasan rows */
  const approxRowPx = rowPx
  const approxOverheadPx = compact ? 420 : 560 /* masthead + customer detail + notes + signature/footer, roughly */
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
    // Re-measure when the items, sheet, or compact mode change, not on every
    // render — measured.* is deliberately left out: it's compared against
    // here to decide whether to update itself, so including it would make
    // every update retrigger the effect. compact must stay in: it changes
    // the actual rendered row height/font/margins, so without it the
    // prediction would keep using pre-compact heights and never reflect
    // the smaller size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pageWidthMm, pageHeightMm, invoice?.id, compact])

  // How much to scale for Fit to 1 page. Measured from the rendered page
  // (undoing the preview's own shrink-to-screen and the current zoom), less
  // what only shows on screen. Runs after every render but only stores a
  // real change, so it settles.
  // The invoice's height as it will print: for an instant, everything
  // printing hides (screen-only buttons, empty header rows, page-break
  // hints) is hidden the same way, the height is read, and it's put back
  // before anything is drawn.
  const availablePx = (pageHeightMm - HEADER_MARGIN_MM - FOOTER_MARGIN_MM - (20 - HEADER_MARGIN_MM) - (15 - FOOTER_MARGIN_MM)) * MM_TO_PX * 0.98
  const measurePrinted = (): number | null => {
    const el = fitBodyRef.current
    if (!el) return null
    const root = document.documentElement
    root.classList.add('kma-print-measure')
    const h = el.getBoundingClientRect().height / (scale || 1)
    root.classList.remove('kma-print-measure')
    return h
  }
  // No dependency list on purpose: it measures the rendered page, which any
  // edit, note, paper size or font load can change; it only stores a real
  // change, so it settles in a couple of passes (sizes and height move
  // together, so each pass lands close).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const printed = measurePrinted()
    if (printed == null) return
    const fits = printed <= availablePx
    if (fits !== fitsAtFullSize) setFitsAtFullSize(fits)
    if (!fitActive) return
    // Smaller by how much it's over; back up (never past full size) when
    // there's room to spare.
    let target = fit
    if (printed > availablePx) target = fit * (availablePx / printed)
    else if (fit < 1 && printed < availablePx * 0.97) target = Math.min(1, fit * (availablePx / printed))
    // Below 70% the text is too small: full size, on more pages, instead.
    const tooLong = target < 0.7
    const next = tooLong ? 1 : Math.floor(target * 200) / 200
    if (tooLong !== tooLongForOnePage) setTooLongForOnePage(tooLong)
    if (Math.abs(next - fit) >= 0.005) setFitZoom(next)
  })

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
  // When the true printed height says it's one page (as it is, or scaled by
  // Fit to 1 page), there's nothing to predict: the cautious guess below
  // (with its 18% safety margin) used to mark a page 2 on an invoice that
  // prints on one.
  const printsOnOnePage = manualBreaks.size === 0 && fitsAtFullSize === true
  if (hasMeasurements && !printsOnOnePage) {
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
    // Totals, notes, and the closing block (signature/footer) each avoid
    // breaking on their own, so each is checked in turn against what's
    // left, and the first one to spill is where the seam (and the
    // continuation note) goes. Each is its own independently-breakable
    // unit — notes fitting in whatever's left of page 1 doesn't force
    // closing to also move, so a near-miss invoice doesn't lose a whole
    // page of blank space just because the very last block didn't fit.
    // The drift margin carries over from the items but doesn't keep
    // growing across these three big, directly measured blocks.
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
  const previewTotalPages = printsOnOnePage ? 1 : Math.max(
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

  // Live, not this invoice's own (possibly stale) down_payment — see allInvoices
  // above. For a DP invoice this is itself, so nothing changes there; only a
  // Pelunasan printed after its DP was corrected is affected.
  const liveDownPayment = resolveLiveDownPayment(invoice, allInvoices)
  // The Pelunasan balance, recomputed live from that same figure rather than
  // this invoice's own stored remaining/ar_receivable, for the same reason.
  const liveBalanceDue = balanceDue(invoice, allInvoices)

  const dpPercent = invoice.total > 0
    ? Math.round((liveDownPayment / invoice.total) * 100)
    : 50

  // Each fixed column's content this render, for auto-fit. KETERANGAN takes the
  // remaining width.
  const hasDp = liveDownPayment > 0
  const columnTexts: Record<ColumnKey, string[]> = {
    no: ['ITEM', ...groups.map((_, i) => String(i + 1))],
    size: ['SIZE', ...items.map(i => i.size || '-')],
    qty: [
      'QTY / SET',
      ...items.map(i => num(i.amount)),
      num(items.reduce((s, i) => s + i.amount, 0)),
      ...(invoice.type === 'pelunasan' ? [dpPaidLabel.value] : []),
    ],
    hargaNet: [
      'HARGA NET / PCS',
      ...items.map(i => num(i.price)),
      'TOTAL',
      ...(hasDp ? [`D/P - ${dpPercent} %`] : []),
      'PELUNASAN',
    ],
    jumlah: [
      'JUMLAH (Rp)',
      ...items.map(i => num(i.sub_total)),
      num(invoice.total),
      // A Pelunasan prints the paid D/P in brackets.
      ...(hasDp ? [invoice.type === 'pelunasan' ? `(${num(liveDownPayment)})` : num(liveDownPayment)] : []),
      // Matches the PELUNASAN cell's actual rendered value below — must
      // stay in sync or a discounted invoice could size the JUMLAH column
      // to a number narrower than what's really printed in it.
      num(liveBalanceDue),
    ],
  }
  // Measured in bold, the heaviest weight any of these cells uses, at
  // whatever size the table is actually printing at right now.
  const autofitFont = `bold ${fontPx}px Arial`
  const fitWidthFor = (column: ColumnKey) =>
    columnTexts[column].reduce((max, t) => Math.max(max, measureTextWidth(t, autofitFont)), 0) + AUTOFIT_PADDING
  const columnWidths: Record<ColumnKey, number> = {
    no: fitWidthFor('no'),
    size: fitWidthFor('size'),
    qty: fitWidthFor('qty'),
    hargaNet: fitWidthFor('hargaNet'),
    jumlah: fitWidthFor('jumlah'),
  }

  // Cell styles for the item table, in the Excel invoice's look.
  const headCell: React.CSSProperties = { borderLeft: LINE, borderRight: LINE, borderBottom: '3px double #e26b0a', padding: `${sz(8)}px 4px`, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: `${fontPx - 1}px` }
  const bodyCell: React.CSSProperties = { borderLeft: LINE, borderRight: LINE, borderTop: ROW_LINE, borderBottom: ROW_LINE, padding: cellPad, height: `${rowPx}px`, whiteSpace: 'nowrap' }
  const sumCell: React.CSSProperties = { border: LINE, padding: cellPad, height: `${rowPx + 4}px`, fontWeight: 'bold', whiteSpace: 'nowrap' }
  const openCell: React.CSSProperties = { padding: cellPad, height: `${rowPx + 4}px`, borderTop: 'none', borderBottom: 'none' }
  const infoLabel: React.CSSProperties = { padding: '0 12px 3px 0', whiteSpace: 'nowrap', verticalAlign: 'top', width: '1%' }
  const infoValue: React.CSSProperties = { padding: '0 0 3px', verticalAlign: 'top' }
  const gapButton: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: '4px', width: `${gapCtrlSize}px`, height: `${gapCtrlSize}px`, lineHeight: 1, fontSize: `${Math.max(9, gapCtrlSize - 3)}px`, color: '#64748b', background: 'white', cursor: 'pointer', padding: 0 }

  // Running row number for the table's cells, counted as it renders.
  const sheetRow = { n: 0 }

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
          {sheetBusy && <span className="badge bg-amber-50 text-amber-700" role="status">{t('invoiceSheet.saving')}</span>}
          {/* "At least": natural overflow can add pages beyond the prediction. */}
          {previewTotalPages > 1 && (
            <span className="badge bg-slate-100 text-slate-600">
              at least {previewTotalPages} page{previewTotalPages === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Fit to 1 page (on by default): scales the whole invoice down just
             enough to fit one page, never below 70%. See fitOnePage. */}
          <button
            type="button"
            onClick={() => setFitOnePage(f => !f)}
            title={fitOnePage ? t('invoiceSheet.fitOffTitle') : t('invoiceSheet.fitOnTitle')}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              fitOnePage
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Rows3 size={13} /> {t('invoiceSheet.fit')}
            {fitActive && fitZoom < 1 && <span className="opacity-75">· {Math.round(fitZoom * 100)}%</span>}
          </button>
          {fitOnePage && manualBreaks.size > 0 && <span className="text-xs text-slate-400">{t('invoiceSheet.fitOffBreaks')}</span>}
          {fitOnePage && manualBreaks.size === 0 && tooLongForOnePage && <span className="text-xs text-amber-700">{t('invoiceSheet.tooLong')}</span>}
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
              fontSize: `${fontPx}px`,
              color: '#000',
            }}
          >
          {/* The whole invoice body, scaled as one by Fit to 1 page. */}
          <div ref={fitBodyRef}>
          {/* Everything above the item table, measured as one block for the prediction.
              The layout follows KMA's own Excel invoice: logo and name top left, a
              serif INVOICE title, the client on the left and the invoice's details
              on the right, everything in bold. */}
          <div ref={topBlockRef}>
          {/* The logo centred over the company name, the pair at top left. */}
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', marginBottom: tightMargin(6) }}>
            <img src="/Logo.png" alt="KMA Logo" style={{ width: `${sz(90)}px`, height: 'auto', display: 'block' }} />
            <div style={{ fontWeight: 'bold', fontSize: `${fontPx}px`, letterSpacing: '1px', marginTop: tightMargin(8) }}>KREASI&nbsp; MAKMUR&nbsp; ABADI</div>
          </div>

          <div style={{ textAlign: 'center', fontFamily: SERIF, fontWeight: 'bold', color: TITLE_BLUE, fontSize: `${sz(27)}px`, letterSpacing: '0.5px', margin: `0 0 ${tightMargin(12)}px` }}>
            INVOICE
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0 24px', marginBottom: tightMargin(14), fontSize: `${fontPx - 0.5}px`, fontWeight: 'bold', lineHeight: 1.3 }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={infoLabel}>KEPADA YTH</td>
                  <td style={infoValue}><SheetCell value={invoice.kepada_yth} onSave={v => saveInvoiceField('kepada_yth', v)} /></td>
                </tr>
                <tr>
                  <td style={infoLabel}>UNTUK</td>
                  <td style={infoValue}>
                    <SheetCell value={invoice.untuk ?? ''} onSave={v => saveInvoiceField('untuk', v)} uppercase={false} placeholder="…" />
                    <SheetCell value={invoice.alamat ?? ''} onSave={v => saveInvoiceField('alamat', v)} uppercase={false} placeholder="…" />
                  </td>
                </tr>
                {/* Shown on paper only when filled; always editable on screen. */}
                <tr className={invoice.telp ? undefined : 'print:hidden'}>
                  <td style={{ ...infoLabel, paddingTop: tightMargin(8) }}>Telp</td>
                  <td style={{ ...infoValue, paddingTop: tightMargin(8) }}><SheetCell value={invoice.telp ?? ''} onSave={v => saveInvoiceField('telp', v)} placeholder="…" /></td>
                </tr>
                <tr className={invoice.email ? undefined : 'print:hidden'}>
                  <td style={infoLabel}>Email</td>
                  <td style={{ ...infoValue, color: '#1a56db', textDecoration: 'underline', fontWeight: 'normal' }}><SheetCell value={invoice.email ?? ''} onSave={v => saveInvoiceField('email', v)} uppercase={false} placeholder="…" /></td>
                </tr>
              </tbody>
            </table>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={infoLabel}>TANGGAL</td>
                  <td style={infoValue}><SheetCell value={formatDate(invoice.tanggal)} onSave={v => saveInvoiceField('tanggal', v)} /></td>
                </tr>
                <tr>
                  <td style={infoLabel}>INVOICE No.</td>
                  <td style={infoValue}>{invoice.id}</td>
                </tr>
                <tr>
                  <td style={infoLabel}>PO No.</td>
                  <td style={infoValue}><SheetCell value={order?.po_number || ''} onSave={savePoNumber} placeholder="-" /></td>
                </tr>
                <tr className={invoice.lama_produksi ? undefined : 'print:hidden'}>
                  <td style={infoLabel}>LAMA PRODUKSI</td>
                  <td style={infoValue}><SheetCell value={(invoice.lama_produksi ?? '').toUpperCase()} onSave={v => saveInvoiceField('lama_produksi', v)} placeholder="…" /></td>
                </tr>
                <tr className={invoice.start_produksi ? undefined : 'print:hidden'}>
                  <td style={infoLabel}>MULAI PRODUKSI</td>
                  <td style={infoValue}><SheetCell value={invoice.start_produksi ? (/^\d{4}-\d{2}-\d{2}/.test(invoice.start_produksi) ? formatDate(invoice.start_produksi) : invoice.start_produksi.toUpperCase()) : ''} onSave={v => saveInvoiceField('start_produksi', v)} placeholder="…" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
          {/* ↑ closes the topBlockRef wrapper */}

          {/* Items table: black outer frame and column lines, light row lines, an
              orange double rule under the heading, a double line to close it.
              table-layout fixed makes the auto-fit <th> widths authoritative. */}
          <table onPaste={onSheetPaste} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: `${fontPx}px`, lineHeight: 1.2, tableLayout: 'fixed', border: FRAME, borderBottom: '3px double #000' }}>
            <thead ref={theadRef}>
              <tr>
                <th style={{ ...headCell, width: `${columnWidths.no}px` }}>ITEM</th>
                {/* KETERANGAN takes the remaining width and may wrap (long item names). */}
                <th style={headCell}>KETERANGAN</th>
                <th style={{ ...headCell, width: `${columnWidths.size}px` }}>SIZE</th>
                <th style={{ ...headCell, width: `${columnWidths.qty}px` }}>QTY / SET</th>
                {/* Fitted to the longest amount; no ellipsis, so a sizing bug would show. */}
                <th style={{ ...headCell, width: `${columnWidths.hargaNet}px` }}>HARGA NET / PCS</th>
                <th style={{ ...headCell, width: `${columnWidths.jumlah}px` }}>JUMLAH (Rp)</th>
              </tr>
            </thead>

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
              // Printed only where a break is certain (one placed by hand). A
              // predicted break is a cautious guess, and printing "(continued on
              // next page)" mid-page when the guess was early read as an error;
              // the repeated headings and "Page x of y" already show a real break.
              const endsPageHere = !isLastGroup && !!nextGroup && manualBreaks.has(nextGroup.name)

              return (
                <Fragment key={group.name}>
                  {/* Screen-only markers live in their own tbody so they're never measured as content. */}
                  {(showBreakMarker || predictedBreakHere) && (
                    <tbody>
                      {showBreakMarker && (
                        <tr className="print:hidden">
                          <td colSpan={6} style={{ padding: 0 }}>
                            <PageBreakGap endPage={endOfPageLabel} startPage={startOfPageLabel!} total={previewTotalPages} invoiceId={invoice.id} client={invoice.kepada_yth} strong />
                          </td>
                        </tr>
                      )}
                      {predictedBreakHere && (
                        <tr className="print:hidden">
                          <td colSpan={6} style={{ padding: '4px 0' }}>
                            <PageBreakGap endPage={endOfPageLabel} startPage={startOfPageLabel!} total={previewTotalPages} invoiceId={invoice.id} client={invoice.kepada_yth} strong={false} />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )}
                  <tbody
                    ref={el => { groupRefs.current[group.name] = el }}
                    style={{
                      pageBreakInside: 'avoid',
                      ...(manualBreakHere ? { pageBreakBefore: 'always', breakBefore: 'page' } : {}),
                    }}
                  >
                    {group.rows.map((item, rowIdx) => {
                      const key = `item-${item.id}`
                      const bg = rowHighlights[key]
                      const r = sheetRow.n++
                      return (
                        <tr key={key} {...highlightRowHandlers(key)} style={{ background: bg }} className="sheet-row">
                          <td style={{ ...bodyCell, textAlign: 'center', position: 'relative' }}>
                            {rowIdx === 0 ? groupIdx + 1 : ''}
                            {/* Delete this line (screen only, shows on hover or focus). */}
                            <button type="button" className="sheet-del print:hidden" title={t('invoiceSheet.deleteRow')} aria-label={t('invoiceSheet.deleteRowNamed', { name: `${item.item_name} ${item.size ?? ''}`.trim() })}
                              onClick={e => { e.stopPropagation(); setConfirmDeleteItem(item) }}>×</button>
                          </td>
                          <td style={{ ...bodyCell, whiteSpace: 'normal' }}>
                            <SheetCell value={rowIdx === 0 ? item.item_name.toUpperCase() : ''} onSave={v => saveItemCell(item, 'name', v, rowIdx === 0 ? group.rows : null)} align="center" bold cellRef={sheetRef(r, 0)} onMove={sheetMove(r, 0)} />
                          </td>
                          <td style={{ ...bodyCell, textAlign: 'center' }}><SheetCell value={item.size ?? ''} onSave={v => saveItemCell(item, 'size', v, null)} align="center" placeholder="-" cellRef={sheetRef(r, 1)} onMove={sheetMove(r, 1)} /></td>
                          <td style={{ ...bodyCell, textAlign: 'right' }}><SheetCell value={item.amount} numeric onSave={v => saveItemCell(item, 'qty', v, null)} align="right" cellRef={sheetRef(r, 2)} onMove={sheetMove(r, 2)} /></td>
                          <td style={{ ...bodyCell, textAlign: 'right' }}><SheetCell value={item.price} numeric onSave={v => saveItemCell(item, 'price', v, null)} align="right" cellRef={sheetRef(r, 3)} onMove={sheetMove(r, 3)} /></td>
                          <td style={{ ...bodyCell, textAlign: 'right' }}>{num(item.sub_total)}</td>
                        </tr>
                      )
                    })}
                    {/* A blank row after every group with a dash under JUMLAH, as in the
                        Excel; + adds more blank rows (screen only). */}
                    {(() => {
                      const extra = extraGapRows[group.name] ?? 0
                      const totalGapRows = 1 + extra
                      return Array.from({ length: totalGapRows }, (_, gapIdx) => {
                        const key = `gap-${group.name}-${gapIdx}`
                        const isLastGapRow = gapIdx === totalGapRows - 1
                        const cellStyle = { ...bodyCell, background: rowHighlights[key] }
                        const r = sheetRow.n++
                        // Typing here adds a line: a new size of the item above,
                        // or a new item when a KETERANGAN is typed.
                        return (
                          <tr key={key} {...highlightRowHandlers(key)}>
                            <td style={cellStyle} />
                            <td style={cellStyle}><SheetCell value="" onSave={v => saveBlankCell(null, 'name', v)} align="center" bold placeholder={gapIdx === 0 ? t('invoiceSheet.newItem') : ''} cellRef={sheetRef(r, 0)} onMove={sheetMove(r, 0)} /></td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}><SheetCell value="" onSave={v => saveBlankCell(group.name, 'size', v)} align="center" placeholder={gapIdx === 0 ? t('invoiceSheet.newSize') : ''} cellRef={sheetRef(r, 1)} onMove={sheetMove(r, 1)} /></td>
                            <td style={cellStyle}><SheetCell value="" numeric onSave={v => saveBlankCell(group.name, 'qty', v)} align="right" cellRef={sheetRef(r, 2)} onMove={sheetMove(r, 2)} /></td>
                            <td style={cellStyle}><SheetCell value="" numeric onSave={v => saveBlankCell(group.name, 'price', v)} align="right" cellRef={sheetRef(r, 3)} onMove={sheetMove(r, 3)} /></td>
                            <td style={{ ...cellStyle, textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                {isLastGapRow && (
                                  <span className="print:hidden" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: '3px', marginRight: 'auto' }}>
                                    {extra > 0 && (
                                      <button type="button" title="Remove blank row" onClick={() => removeGapRow(group.name)} style={gapButton}>−</button>
                                    )}
                                    <button type="button" title="Add blank row" onClick={() => addGapRow(group.name)} style={gapButton}>+</button>
                                  </span>
                                )}
                                <span>-</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    })()}
                    {endsPageHere && (
                      <tr className="continuation-note">
                        <td colSpan={6} style={{ padding: '10px 8px 0', textAlign: 'right', fontSize: '10px', fontStyle: 'italic', color: '#64748b', borderLeft: FRAME, borderRight: FRAME, borderTop: 'none', borderBottom: 'none' }}>
                          (continued on next page)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Fragment>
              )
            })}

            {groups.length === 0 && (
              // No items yet: one blank line to type the first one into.
              <tbody>
                <tr>
                  <td style={bodyCell} />
                  <td style={bodyCell}><SheetCell value="" onSave={v => saveBlankCell(null, 'name', v)} placeholder={t('invoiceSheet.newItem')} cellRef={sheetRef(0, 0)} onMove={sheetMove(0, 0)} /></td>
                  <td style={bodyCell} /><td style={bodyCell} /><td style={bodyCell} /><td style={bodyCell} />
                </tr>
              </tbody>
            )}
            {tailSpillsAt === 'totals' && (
              <tbody className="print:hidden">
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <PageBreakGap endPage={pageSegments.length} startPage={pageSegments.length + 1} total={previewTotalPages} invoiceId={invoice.id} client={invoice.kepada_yth} strong={false} />
                  </td>
                </tr>
              </tbody>
            )}

            {/* TOTAL, then the D/P, then PELUNASAN, in one tbody that never splits.
                The left part has no lines of its own, as in the Excel: a free note
                beside TOTAL, the LUNAS mark beside a paid D/P, and the payment terms
                (J/T, or e.g. CASH ON DELIVERY) beside PELUNASAN. */}
            <tbody ref={totalsRef} style={{ pageBreakInside: 'avoid' }}>
              <tr {...highlightRowHandlers('total')}>
                <td colSpan={3} style={{ ...openCell, borderTop: LINE }}>
                  <div style={{ paddingLeft: '10px' }}><SheetCell value={totalNote} onSave={setTotalNote} uppercase={false} /></div>
                </td>
                <td style={{ ...sumCell, borderTop: LINE, textAlign: 'right', background: rowHighlights['total'] }}>{num(items.reduce((s, i) => s + i.amount, 0))}</td>
                <td style={{ ...sumCell, borderTop: LINE, textAlign: 'center', background: rowHighlights['total'] }}>TOTAL</td>
                <td style={{ ...sumCell, borderTop: LINE, textAlign: 'right', background: rowHighlights['total'] }}>{num(invoice.total)}</td>
              </tr>
              {hasDp && (
                <tr {...highlightRowHandlers('dp')}>
                  <td colSpan={3} style={openCell} />
                  <td style={{ ...sumCell, textAlign: 'right', background: rowHighlights['dp'] }}>
                    {invoice.type === 'pelunasan' && (
                      <span style={{ fontWeight: 'normal' }}><SheetCell value={dpPaidLabel.value} onSave={dpPaidLabel.setValue} align="right" /></span>
                    )}
                  </td>
                  <td style={{ ...sumCell, fontWeight: 'normal', textAlign: 'center', background: rowHighlights['dp'] }}>D/P - {dpPercent} %</td>
                  <td style={{ ...sumCell, textAlign: 'right', background: rowHighlights['dp'] }}>
                    {/* Already paid on a Pelunasan, so taken off, in brackets. */}
                    {invoice.type === 'pelunasan' ? `(${num(liveDownPayment)})` : num(liveDownPayment)}
                  </td>
                </tr>
              )}
              <tr {...highlightRowHandlers('pelunasan')}>
                <td colSpan={4} style={{ ...openCell, textAlign: 'right' }}>
                  <SheetCell value={jatuhTempo.value} onSave={jatuhTempo.setValue} align="right" bold placeholder="J/T : —" />
                </td>
                <td style={{ ...sumCell, textAlign: 'center', background: rowHighlights['pelunasan'] }}>PELUNASAN</td>
                <td style={{ ...sumCell, textAlign: 'right', background: rowHighlights['pelunasan'] }}>
                  {/* The balance after discount, live — see liveBalanceDue above. */}
                  {num(liveBalanceDue)}
                </td>
              </tr>
            </tbody>
          </table>

          {tailSpillsAt === 'notes' && (
            <PageBreakGap endPage={pageSegments.length} startPage={pageSegments.length + 1} total={previewTotalPages} invoiceId={invoice.id} client={invoice.kepada_yth} strong={false} />
          )}

          {/* CATATAN: numbered, in the Excel's serif, with the bank details as the
              last point. Notes and the closing block are each their own unbreakable
              unit, independently placed (see the prediction above). */}
          {(() => {
            const visible = notes.map((n, i) => ({ n, i })).filter(x => x.n.trim() !== '')
            const numberOf = new Map(visible.map((x, k) => [x.i, k + 1]))
            return (
              <div ref={notesRef} style={{ marginTop: tightMargin(12), fontFamily: SERIF, fontSize: `${fontPx}px`, lineHeight: compact ? 1.2 : 1.32, pageBreakInside: 'avoid' }}>
                <div>CATATAN :</div>
                {notes.map((note, idx) => (
                  // An empty line stays editable on screen but doesn't print as a bare number.
                  <div key={idx} className={note.trim() === '' ? 'print:hidden' : undefined} style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ minWidth: '14px' }}>{numberOf.get(idx) ? `${numberOf.get(idx)}.` : ''}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><SheetCell value={note} onSave={v => updateNote(idx, v)} uppercase={false} placeholder="…" /></div>
                    <button type="button" onClick={() => removeNote(idx)} className="print:hidden" title="Remove this note"
                      style={{ flexShrink: 0, width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center', borderRadius: '999px', border: 'none', background: '#e2e8f0', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}>
                      ×
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ minWidth: '14px' }}>{visible.length + 1}.</span>
                  <span>Pembayaran via transfer ke rekening a/n :</span>
                </div>
                {/* Bank details, shared with the kwitansi (useRekening). */}
                <div style={{ paddingLeft: '18px' }}>
                  <SheetCell value={rekening.accountName} onSave={v => setRekening({ accountName: v })} uppercase={false} />
                </div>
                <div style={{ paddingLeft: '18px' }}>
                  <SheetCell value={rekening.bankBranch} onSave={v => setRekening({ bankBranch: v })} uppercase={false} />
                </div>
                <div style={{ paddingLeft: '18px', fontFamily: 'Arial, sans-serif', fontWeight: 'bold' }}>
                  <span style={{ display: 'inline-flex', gap: '4px', whiteSpace: 'nowrap' }}>No. Rek. <SheetCell value={rekening.accountNumber} onSave={v => setRekening({ accountNumber: v })} uppercase={false} /></span>
                </div>
                <button ref={addNoteBtnRef} type="button" onClick={addNote} className="print:hidden btn-secondary flex items-center gap-1.5" style={{ marginTop: '8px', fontSize: '12px', padding: '4px 10px', fontFamily: 'Arial, sans-serif' }}>
                  <Plus size={12} /> Add note
                </button>
              </div>
            )
          })()}

          {tailSpillsAt === 'closing' && (
            <PageBreakGap endPage={pageSegments.length} startPage={pageSegments.length + 1} total={previewTotalPages} invoiceId={invoice.id} client={invoice.kepada_yth} strong={false} />
          )}

          {/* Signatures, the copy list and the company's address, as one unit. */}
          <div ref={closingRef} style={{ pageBreakInside: 'avoid' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px', marginTop: tightMargin(14), fontSize: `${fontPx - 1}px`, lineHeight: 1.3 }}>
              <div>
                <div style={{ fontWeight: 'bold', paddingLeft: '36px', marginBottom: sz(96) }}>ASLI INVOICE DI TERIMA OLEH :</div>
                <div style={{ fontFamily: SERIF, width: '62%', borderBottom: '1px solid #000', paddingBottom: '1px' }}>TANDA TANGAN</div>
                <div style={{ fontFamily: SERIF }}>NAMA JELAS</div>
                <div style={{ fontFamily: SERIF }}>JABATAN</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: sz(96) }}>DI BUAT OLEH :</div>
                {/* Same font and line as TANDA TANGAN opposite, so the two lines sit level. */}
                <div style={{ fontFamily: SERIF, width: '75%', borderBottom: '1px solid #000', paddingBottom: '1px' }}>&nbsp;</div>
                <div style={{ fontFamily: SERIF, width: '75%' }}>
                  <SheetCell value={signatoryName.value} onSave={signatoryName.setValue} />
                  <SheetCell value={signatoryTitle.value} onSave={signatoryTitle.setValue} />
                </div>
              </div>
            </div>

            {/* Who keeps which copy. */}
            <table style={{ marginTop: tightMargin(10), fontFamily: SERIF, fontSize: `${fontPx - 1}px`, borderCollapse: 'collapse' }}>
              <tbody>
                {[['Asli', 'Client'], ['Copy 1', 'KMA'], ['Copy 2', 'Produksi KMA']].map(([who, copy]) => (
                  <tr key={who}>
                    <td style={{ padding: '0 18px 0 0' }}>{who}</td>
                    <td style={{ padding: '0 18px 0 0' }}>:</td>
                    <td style={{ padding: 0 }}>{copy}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'center', marginTop: tightMargin(14), fontSize: `${fontPx - 1.5}px`, fontWeight: 'bold', lineHeight: 1.35 }}>
              <div>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55 , JAKARTA UTARA 14450</div>
              <div>TELP. 021.300.253.99 / Hp. 0811.857.372</div>
              <div>Email : fifi67@yahoo.com</div>
            </div>
          </div>

          </div>
          {/* ↑ closes the Fit to 1 page wrapper */}

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

      {confirmDeleteItem && (
        <ConfirmDialog
          message={t('invoiceSheet.deleteConfirm', { name: `${confirmDeleteItem.item_name} ${confirmDeleteItem.size ?? ''}`.trim() })}
          onConfirm={() => { deleteItemRow(confirmDeleteItem); setConfirmDeleteItem(null) }}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}

      {/* Print styles */}
      <style>{`
        /* The print-only "(continued on next page)" row: hidden on screen, shown in
           @media print below. */
        .continuation-note { display: none; }

        /* Fit to 1 page measures the invoice as printed: these are hidden for
           that instant exactly as printing hides them (see measureFit). */
        .kma-print-measure #invoice .print\\:hidden { display: none !important; }

        /* The invoice's cells: plain text on paper, Excel-like on screen. */
        .sheet-cell { width: 100%; border: 0; background: transparent; font: inherit; color: inherit; padding: 0; margin: 0; outline: none; }
        .sheet-ph { color: #94a3b8; font-weight: normal; font-style: italic; }
        @media screen {
          .sheet-cell:focus { outline: 2px solid #2563eb; outline-offset: 1px; border-radius: 1px; }
          .sheet-editing { background: #fffbe6; }
        }
        .sheet-del { position: absolute; left: -22px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; border-radius: 999px; border: 1px solid #fecaca; background: #fff; color: #dc2626; font-size: 13px; line-height: 15px; cursor: pointer; opacity: 0; }
        .sheet-row:hover .sheet-del, .sheet-row:focus-within .sheet-del, .sheet-del:focus { opacity: 1; }
        @media (pointer: coarse) { .sheet-del { opacity: 0.8; } }

        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .continuation-note { display: table-row !important; }
          .sheet-ph { visibility: hidden !important; }
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