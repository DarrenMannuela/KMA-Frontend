// How an invoice's item table is laid out and formatted on its print page:
// column widths dragged by hand, items folded to one line, and formatting —
// bold, italic, alignment and fill for a cell, a whole row or a whole
// column, and a row's height. Saved on the server per invoice, so every
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

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  align?: CellAlign
  /** A fill colour, e.g. "#d4e6c3". */
  fill?: string
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
}

const EMPTY: InvoiceLayout = { widths: {}, folded: [], cols: {}, rows: {}, cells: {} }
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
  }
}
function legacyLocal(invoiceId: string): InvoiceLayout | null {
  try {
    const raw = localStorage.getItem(LEGACY_PREFIX + invoiceId)
    return raw ? normalize(JSON.parse(raw)) : null
  } catch { return null }
}
const isEmpty = (l: InvoiceLayout) =>
  !Object.keys(l.widths).length && !l.folded.length && !Object.keys(l.cols).length && !Object.keys(l.rows).length && !Object.keys(l.cells).length

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

export function resolveFormat(layout: InvoiceLayout, rowKey: string, col: FormatColumn): RowFormat {
  return { ...layout.cols[col], ...layout.rows[rowKey], ...layout.cells[`${rowKey}|${col}`] }
}

export type FormatScope = 'cell' | 'row' | 'column'

export function useInvoiceLayout(invoiceId: string | undefined) {
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

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const p = pending.current
    pending.current = null
    if (!p) return
    invoiceSheetApi.save(p.id, p.layout)
      .then(() => qc.setQueryData(['invoice-sheet', p.id], { invoice_id: p.id, settings: p.layout }))
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
  const setFormat = (scope: FormatScope, rowKey: string, col: FormatColumn, patch: Partial<RowFormat>) => update(prev => {
    if (scope === 'column') {
      const cols = { ...prev.cols }
      const f = clean({ ...cols[col], ...patch })
      if (f) cols[col] = f; else delete cols[col]
      return { ...prev, cols }
    }
    if (scope === 'row') {
      const rows = { ...prev.rows }
      const f = clean({ ...rows[rowKey], ...patch })
      if (f) rows[rowKey] = f; else delete rows[rowKey]
      return { ...prev, rows }
    }
    const cells = { ...prev.cells }
    const key = `${rowKey}|${col}`
    const f = clean({ ...cells[key], ...patch })
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
    clearAllFormatting: () => update(prev => ({ ...prev, cols: {}, rows: {}, cells: {} })),
    hasFormatting: Object.keys(layout.cols).length + Object.keys(layout.rows).length + Object.keys(layout.cells).length > 0,
  }
}
