// How an invoice's item table is laid out and formatted on its print page:
// column widths dragged by hand, items folded to one line, and formatting —
// bold, italic, alignment, fill, text size and colour and borders for a
// cell, a whole row or a whole column, and a row's height — plus text typed
// into the table's fixed cells and cells merged into one. Saved on the server per invoice, so every
// computer prints it the same way (it used to be this browser's
// localStorage; an invoice's old local layout moves to the server the first
// time it's opened). Nothing here is the invoice's data, only how it's shown.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoiceSheetApi } from '@/api'

export type InvoiceColumn = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'
/** Every column, KETERANGAN included, for formatting. */
export type FormatColumn = InvoiceColumn | 'ket'
export type CellAlign = 'left' | 'center' | 'right'
export type BorderSide = 'top' | 'right' | 'bottom' | 'left'
/** A cell edge: no line at all, or a thin, thick or double one. */
export type BorderLine = 'none' | 'thin' | 'thick' | 'double'
export type CellBorders = Partial<Record<BorderSide, BorderLine>>

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  align?: CellAlign
  /** A fill colour, e.g. "#d4e6c3". */
  fill?: string
  /** Text size in px at full size (Fit to 1 page scales it). */
  size?: number
  /** Text colour, e.g. "#c00000". */
  color?: string
  /** Edges set here; the others keep the table's own lines. */
  borders?: CellBorders
}
export interface RowFormat extends CellFormat {
  /** The row's height in px at full size (Fit to 1 page scales it). */
  height?: number
}

export interface InvoiceLayout {
  /** Widths in px set by dragging; a column not listed is fitted to its contents. */
  widths: Partial<Record<InvoiceColumn, number>>
  /** Item names whose sizes print as one line. */
  folded: string[]
  /** By column, by row key, and by "rowKey|column"; a cell's own format wins
   *  over its row's, and a row's over its column's. */
  cols: Partial<Record<FormatColumn, CellFormat>>
  rows: Record<string, RowFormat>
  cells: Record<string, CellFormat>
  /** Text typed over a fixed cell (a heading, an ITEM number, a label…), by
   *  "rowKey|column". Amounts are never replaced. */
  texts: Record<string, string>
  /** Cells merged into one, by their top-left "rowKey|column": how many rows
   *  and columns it covers. Rows count down from it in the table's order. */
  merges: Record<string, CellMerge>
}
export interface CellMerge { rows: number; cols: number }

const EMPTY: InvoiceLayout = { widths: {}, folded: [], cols: {}, rows: {}, cells: {}, texts: {}, merges: {} }
const LEGACY_PREFIX = 'kma-invoice-layout:'
const SAVE_DELAY_MS = 600

const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
function normalize(raw: unknown): InvoiceLayout {
  const s = asObject(raw)
  return {
    widths: asObject(s.widths) as InvoiceLayout['widths'],
    folded: Array.isArray(s.folded) ? s.folded.filter((x): x is string => typeof x === 'string') : [],
    cols: asObject(s.cols) as InvoiceLayout['cols'],
    rows: asObject(s.rows) as InvoiceLayout['rows'],
    cells: asObject(s.cells) as InvoiceLayout['cells'],
    texts: Object.fromEntries(Object.entries(asObject(s.texts)).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    merges: Object.fromEntries(Object.entries(asObject(s.merges)).filter(([, v]) => {
      const m = asObject(v)
      return Number.isInteger(m.rows) && Number.isInteger(m.cols) && (m.rows as number) >= 1 && (m.cols as number) >= 1
    })) as Record<string, CellMerge>,
  }
}
function legacyLocal(invoiceId: string): InvoiceLayout | null {
  try {
    const raw = localStorage.getItem(LEGACY_PREFIX + invoiceId)
    return raw ? normalize(JSON.parse(raw)) : null
  } catch { return null }
}
const isEmpty = (l: InvoiceLayout) =>
  !Object.keys(l.widths).length && !l.folded.length && !Object.keys(l.cols).length && !Object.keys(l.rows).length &&
  !Object.keys(l.cells).length && !Object.keys(l.texts).length && !Object.keys(l.merges).length

/** What's saved: formatting of rows that no longer exist (a deleted item,
 *  an item group renamed away) dropped, and empty parts left out, so a
 *  layout stores only what it sets. `alive` says whether a row key is still
 *  on the invoice; without it nothing is dropped. */
function forSaving(l: InvoiceLayout, alive: ((rowKey: string) => boolean) | null): Partial<InvoiceLayout> {
  const keep = <V,>(rec: Record<string, V>, rowOf: (k: string) => string) =>
    alive ? Object.fromEntries(Object.entries(rec).filter(([k]) => alive(rowOf(k)))) : rec
  const cellRow = (k: string) => k.slice(0, k.lastIndexOf('|'))
  const out: Partial<InvoiceLayout> = {
    widths: l.widths,
    folded: alive ? l.folded.filter(name => alive(`fold-${name}`)) : l.folded,
    cols: l.cols,
    rows: keep(l.rows, k => k),
    cells: keep(l.cells, cellRow),
    texts: keep(l.texts, cellRow),
    merges: keep(l.merges, cellRow),
  }
  for (const k of Object.keys(out) as (keyof InvoiceLayout)[]) {
    const v = out[k]
    if (Array.isArray(v) ? !v.length : !Object.keys(v ?? {}).length) delete out[k]
  }
  return out
}

/** A format with its unset parts left out (so it doesn't override a wider one). */
function clean<T extends object>(f: T): T | undefined {
  // false stays: a cell can be not-bold inside a bold row or column.
  const out = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')) as T
  return Object.keys(out).length ? out : undefined
}

/** Fill colours: the muted pastels the old Highlight tool had. */
export const FILL_PALETTE = [
  { name: 'Sage', value: '#d4e6c3' },
  { name: 'Dusty Blue', value: '#c3d9e6' },
  { name: 'Wheat', value: '#e6dcc3' },
  { name: 'Terracotta', value: '#e6c3c3' },
  { name: 'Dusty Rose', value: '#e6c3d9' },
  { name: 'Lavender', value: '#d9c3e6' },
  { name: 'Muted Teal', value: '#c3e6da' },
  { name: 'Warm Gray', value: '#dcdcd4' },
] as const

/** Text colours: black first (the invoice's own), then a few dark ones that
 *  print clearly. */
export const TEXT_PALETTE = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark Blue', value: '#1f4e79' },
  { name: 'Red', value: '#c00000' },
  { name: 'Green', value: '#2e7d32' },
  { name: 'Orange', value: '#c65911' },
  { name: 'Purple', value: '#6a3d9a' },
  { name: 'Gray', value: '#595959' },
] as const

/** Border choices, applied to every cell of the selection. */
export type BorderPreset = 'all' | 'box' | 'bottom' | 'bottomThick' | 'bottomDouble' | 'top' | 'none' | 'reset'
export const BORDER_PRESETS: Record<Exclude<BorderPreset, 'reset'>, CellBorders> = {
  all: { top: 'thin', right: 'thin', bottom: 'thin', left: 'thin' },
  box: { top: 'thick', right: 'thick', bottom: 'thick', left: 'thick' },
  bottom: { bottom: 'thin' },
  bottomThick: { bottom: 'thick' },
  bottomDouble: { bottom: 'double' },
  top: { top: 'thin' },
  none: { top: 'none', right: 'none', bottom: 'none', left: 'none' },
}

/** Text sizes the Format bar steps through, px. */
export const TEXT_SIZE_LIMITS = { min: 6, max: 32, step: 0.5 }

export function resolveFormat(layout: InvoiceLayout, rowKey: string, col: FormatColumn): RowFormat {
  const c = layout.cols[col], r = layout.rows[rowKey], k = layout.cells[`${rowKey}|${col}`]
  const out: RowFormat = { ...c, ...r, ...k }
  // Each edge on its own: a cell's bottom line doesn't undo its row's top one.
  const borders = { ...c?.borders, ...r?.borders, ...k?.borders }
  if (Object.keys(borders).length) out.borders = borders
  else delete out.borders
  return out
}

export type FormatScope = 'cell' | 'row' | 'column'
/** A change to a format: borders add to the edges already set, null clears them. */
export type FormatPatch = Omit<Partial<RowFormat>, 'borders'> & { borders?: CellBorders | null }

export function useInvoiceLayout(invoiceId: string | undefined, alive: ((rowKey: string) => boolean) | null = null) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['invoice-sheet', invoiceId],
    queryFn: () => invoiceSheetApi.get(invoiceId!),
    enabled: !!invoiceId,
    staleTime: Infinity,
  })
  const [layout, setLayout] = useState<InvoiceLayout>(EMPTY)
  const loadedFor = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ id: string; layout: InvoiceLayout } | null>(null)
  const aliveRef = useRef(alive)
  aliveRef.current = alive

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const p = pending.current
    pending.current = null
    if (!p) return
    const settings = forSaving(p.layout, aliveRef.current)
    invoiceSheetApi.save(p.id, settings)
      .then(() => qc.setQueryData(['invoice-sheet', p.id], { invoice_id: p.id, settings: Object.keys(settings).length ? settings : null }))
      .catch(() => { /* kept on screen; the next change tries again */ })
  }, [qc])

  // Load once the invoice's saved layout arrives; an invoice with none yet
  // takes this browser's old local one (and saves it for everyone).
  useEffect(() => {
    if (!invoiceId || !data || loadedFor.current === invoiceId) return
    loadedFor.current = invoiceId
    const saved = data.settings == null ? null : normalize(data.settings)
    const local = legacyLocal(invoiceId)
    if (!saved && local && !isEmpty(local)) {
      setLayout(local)
      pending.current = { id: invoiceId, layout: local }
      flush()
    } else {
      setLayout(saved ?? EMPTY)
    }
    try { localStorage.removeItem(LEGACY_PREFIX + invoiceId) } catch { /* nothing to tidy */ }
  }, [invoiceId, data, flush])

  // Leaving the page saves anything still waiting.
  useEffect(() => () => flush(), [flush])

  const update = (fn: (prev: InvoiceLayout) => InvoiceLayout) => {
    setLayout(prev => {
      const next = fn(prev)
      if (invoiceId) {
        pending.current = { id: invoiceId, layout: next }
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, SAVE_DELAY_MS)
      }
      return next
    })
  }

  /** Changes the format of a cell, its row or its column (undefined clears a part). */
  // Borders in a patch add to the edges already set (null clears them all).
  const merged = <T extends CellFormat>(cur: T | undefined, patch: FormatPatch): T | undefined => {
    const { borders, ...rest } = patch
    const next = { ...cur, ...rest } as T
    if (borders === null) delete next.borders
    else if (borders) next.borders = { ...cur?.borders, ...borders }
    return clean(next)
  }
  const setFormat = (scope: FormatScope, rowKey: string, col: FormatColumn, patch: FormatPatch) => update(prev => {
    if (scope === 'column') {
      const cols = { ...prev.cols }
      const f = merged(cols[col], patch)
      if (f) cols[col] = f; else delete cols[col]
      return { ...prev, cols }
    }
    if (scope === 'row') {
      const rows = { ...prev.rows }
      const f = merged(rows[rowKey], patch)
      if (f) rows[rowKey] = f; else delete rows[rowKey]
      return { ...prev, rows }
    }
    const cells = { ...prev.cells }
    const key = `${rowKey}|${col}`
    const f = merged(cells[key], patch)
    if (f) cells[key] = f; else delete cells[key]
    return { ...prev, cells }
  })

  /** Removes a scope's own format (keeping a row's height unless it's the row). */
  const clearFormat = (scope: FormatScope, rowKey: string, col: FormatColumn) => update(prev => {
    if (scope === 'column') { const cols = { ...prev.cols }; delete cols[col]; return { ...prev, cols } }
    if (scope === 'row') {
      const rows = { ...prev.rows }
      const h = rows[rowKey]?.height
      if (h) rows[rowKey] = { height: h }; else delete rows[rowKey]
      return { ...prev, rows }
    }
    const cells = { ...prev.cells }; delete cells[`${rowKey}|${col}`]; return { ...prev, cells }
  })

  return {
    layout,
    setWidth: (col: InvoiceColumn, px: number | null) => update(prev => {
      const widths = { ...prev.widths }
      if (px == null) delete widths[col]
      else widths[col] = Math.round(px)
      return { ...prev, widths }
    }),
    resetWidths: () => update(prev => ({ ...prev, widths: {} })),
    toggleFold: (name: string) => update(prev => ({
      ...prev,
      folded: prev.folded.includes(name) ? prev.folded.filter(n => n !== name) : [...prev.folded, name],
    })),
    setFolded: (names: string[]) => update(prev => ({ ...prev, folded: names })),
    setFormat,
    clearFormat,
    /** Text over a fixed cell; undefined goes back to the cell's own. */
    setText: (rowKey: string, col: FormatColumn, text: string | undefined) => update(prev => {
      const texts = { ...prev.texts }
      if (text === undefined) delete texts[`${rowKey}|${col}`]
      else texts[`${rowKey}|${col}`] = text
      return { ...prev, texts }
    }),
    /** Merges a block of cells into its top-left one, replacing any merge
     *  it overlaps (`overlaps` says which anchors those are). */
    mergeCells: (rowKey: string, col: FormatColumn, size: CellMerge, overlaps: string[]) => update(prev => {
      const merges = { ...prev.merges }
      overlaps.forEach(k => delete merges[k])
      if (size.rows > 1 || size.cols > 1) merges[`${rowKey}|${col}`] = size
      return { ...prev, merges }
    }),
    unmerge: (anchor: string) => update(prev => {
      const merges = { ...prev.merges }
      delete merges[anchor]
      return { ...prev, merges }
    }),
    // Typed text is the invoice's content, so it stays.
    clearAllFormatting: () => update(prev => ({ ...prev, cols: {}, rows: {}, cells: {}, merges: {} })),
    hasFormatting: Object.keys(layout.cols).length + Object.keys(layout.rows).length + Object.keys(layout.cells).length + Object.keys(layout.merges).length > 0,
  }
}
