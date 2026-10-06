import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Download, FileUp, Link2, Plus, Search, Trash2, X,
  ArrowRightLeft, Tag, Copy, CheckSquare,
} from 'lucide-react'
import { EditableCell, formatRp, Spinner } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui'
import {
  productionHooks, operationHooks, supplierHooks, orderHooks, useFinanceHeaders, useFinanceBatch, undoLast, useBudgets,
} from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SI_UNITS } from '@/utils/Units'
import { formatDateShort, shortMonthLabel as monthShort } from '@/utils/MonthUtils'
import { parseDelimited } from '@/utils/tableText'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import type { FinanceBatch } from '@/types'
import {
  fromProduction, fromOperation, editBatch, deleteBatch, inPeriod, previousPeriod, searchText, matchesSearch,
  supplierLabel, supplierWithCategory, orderLabel, newDraft,
  type Kind, type LedgerRow, type EditField, type Period, type DraftLine,
} from './ledgerModel'
import { PeriodPicker, periodLabel, periodSlug, currentPeriod } from './PeriodPicker'
import { KasBonForm } from './KasBonForm'
import { ImportDialog } from './ImportDialog'
import { MoveDialog, SetFieldDialog, LineEditor } from './LedgerDialogs'
import { ledgerSheet, exportLedger } from './ledgerExport'
import { guessColumns, readRows } from './columnGuess'
import type { Grid } from '@/utils/tableText'

export type GroupBy = 'kasbon' | 'group' | 'order' | 'none'
type SortKey = 'header_id' | 'date' | 'name' | 'group' | 'qty' | 'price' | 'total' | 'order_id'
interface Sort { key: SortKey; dir: 'asc' | 'desc' }

export interface LedgerFilters {
  q: string
  period: Period
  /** A supplier id (production) or category (operation); '' for all. */
  group: string
  /** 'any', 'none' (not linked), 'linked', or an order id. */
  order: string
  groupBy: GroupBy
}

const PAGE = 400

/** "05/KB/26" sorts after "04/KB/26" and after "99/KB/25". */
function kasBonOrder(id: string): number {
  const m = id.match(/^(\d+)\/KB\/(\d+)$/)
  return m ? Number(m[2]) * 100000 + Number(m[1]) : -1
}

const prefKey = (kind: Kind) => `kma.ledger.${kind}`
function loadPrefs(kind: Kind): Partial<LedgerFilters> {
  try {
    const raw = localStorage.getItem(prefKey(kind))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['TEXTAREA', 'SELECT'].includes(el.tagName) ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type)))

/** The Production or Operations spreadsheet: every Kas Bon line, searchable
 *  across months, editable in place, with bulk changes, paste from Excel,
 *  import/export and undo. */
export function Ledger({ kind, initial, title, icon, onBack }: {
  kind: Kind
  initial?: Partial<LedgerFilters>
  title: string
  icon: React.ReactNode
  onBack?: () => void
}) {
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const production = productionHooks.useList()
  const operations = operationHooks.useList()
  const source = kind === 'production' ? production : operations
  const { data: suppliers = [] } = supplierHooks.useList()
  const { data: orders = [] } = orderHooks.useList()
  const { data: headers = [] } = useFinanceHeaders()
  const { data: budgets = [] } = useBudgets()
  const batch = useFinanceBatch()

  const [filters, setFilters] = useState<LedgerFilters>(() => {
    const saved = loadPrefs(kind)
    return {
      q: '', group: '', order: 'any',
      groupBy: saved.groupBy ?? 'kasbon',
      period: { ...currentPeriod(saved.period?.mode ?? 'month') },
      ...initial,
    }
  })
  const setFilter = <K extends keyof LedgerFilters>(k: K, v: LedgerFilters[K]) => setFilters(f => ({ ...f, [k]: v }))
  useEffect(() => {
    try {
      localStorage.setItem(prefKey(kind), JSON.stringify({ groupBy: filters.groupBy, period: { mode: filters.period.mode } }))
    } catch { /* private mode */ }
  }, [kind, filters.groupBy, filters.period.mode])

  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [form, setForm] = useState<{ headerId?: string; lines?: DraftLine[] } | null>(null)
  const [importGrid, setImportGrid] = useState<Grid | null | undefined>(undefined)
  const [dialog, setDialog] = useState<null | 'move' | 'supplier_id' | 'category' | 'order_id' | 'delete'>(null)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastClicked = useRef<number | null>(null)

  const allRows = useMemo<LedgerRow[]>(
    () => (kind === 'production' ? production.data.map(fromProduction) : operations.data.map(fromOperation)),
    [kind, production.data, operations.data],
  )
  const otherCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of kind === 'production' ? operations.data : production.data) counts.set(r.header_id, (counts.get(r.header_id) ?? 0) + 1)
    return counts
  }, [kind, production.data, operations.data])

  const categories = useMemo(
    () => [...new Set(operations.data.map(r => r.category).filter(Boolean))].sort(),
    [operations.data],
  )
  const groupName = useCallback((r: LedgerRow) => (kind === 'production' ? supplierLabel(suppliers, r.supplier_id) : r.category || 'Uncategorized'), [kind, suppliers])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const texts = useMemo(() => new Map(allRows.map(r => [r.id, searchText(r, suppliers, orders)])), [allRows, suppliers, orders])
  const passes = useCallback((r: LedgerRow, period: Period) => {
    if (!inPeriod(r.date, period)) return false
    if (filters.group && (kind === 'production' ? String(r.supplier_id) : r.category) !== filters.group) return false
    if (filters.order === 'none' && r.order_id) return false
    if (filters.order === 'linked' && !r.order_id) return false
    if (!['any', 'none', 'linked'].includes(filters.order) && r.order_id !== filters.order) return false
    return !filters.q || matchesSearch(texts.get(r.id) ?? '', filters.q)
  }, [filters, kind, texts])

  // A search looks through every month; the period still applies otherwise.
  const searching = !!filters.q.trim() && filters.period.mode === 'month'
  const searchPeriod = useMemo<Period>(() => (searching ? { ...filters.period, mode: 'all' } : filters.period), [searching, filters.period])
  const visible = useMemo(() => allRows.filter(r => passes(r, searchPeriod)), [allRows, passes, searchPeriod])
  const prev = useMemo(() => previousPeriod(searchPeriod), [searchPeriod])
  // While a month is still running, compare it with the same days of the
  // month before (1–6 Oct against 1–6 Sep), not the whole of it.
  const today = new Date()
  const running = searchPeriod.mode === 'month' && searchPeriod.year === today.getFullYear() && searchPeriod.month === today.getMonth()
  const prevTotal = useMemo(() => {
    if (!prev) return null
    return allRows
      .filter(r => passes(r, prev) && (!running || Number(r.date.slice(8, 10)) <= today.getDate()))
      .reduce((n, r) => n + r.total, 0)
  }, [allRows, passes, prev, running]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevName = prev ? (running ? `1–${today.getDate()} ${monthShort(prev.month)}` : periodLabel(prev)) : ''

  // ── Sorting and grouping ───────────────────────────────────────────────────
  const sortValue = useCallback((r: LedgerRow): string | number => {
    switch (sort.key) {
      case 'header_id': return kasBonOrder(r.header_id)
      case 'date': return `${r.date.slice(0, 10)}|${String(kasBonOrder(r.header_id)).padStart(9, '0')}|${String(r.id).padStart(9, '0')}`
      case 'group': return groupName(r).toLowerCase()
      case 'order_id': return r.order_id ?? ''
      case 'name': return r.name.toLowerCase()
      default: return r[sort.key]
    }
  }, [sort.key, groupName])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...visible].sort((a, b) => {
      const x = sortValue(a), y = sortValue(b)
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }, [visible, sortValue, sort.dir])

  const groups = useMemo(() => {
    if (filters.groupBy === 'none') return [{ key: '', rows: sorted }]
    const keyOf = (r: LedgerRow) =>
      filters.groupBy === 'kasbon' ? r.header_id : filters.groupBy === 'order' ? r.order_id ?? '' : kind === 'production' ? String(r.supplier_id) : r.category
    const map = new Map<string, LedgerRow[]>()
    for (const r of sorted) map.set(keyOf(r), [...(map.get(keyOf(r)) ?? []), r])
    const list = [...map.entries()].map(([key, rows]) => ({ key, rows }))
    // Kas Bons keep the rows' order; other groupings put the biggest first.
    if (filters.groupBy !== 'kasbon') list.sort((a, b) => b.rows.reduce((n, r) => n + r.total, 0) - a.rows.reduce((n, r) => n + r.total, 0))
    if (filters.groupBy === 'order') list.sort((a, b) => Number(!a.key) - Number(!b.key))
    return list
  }, [sorted, filters.groupBy, kind])

  // What's actually on screen, in order (for range selection and paging).
  const shown = useMemo(() => {
    const out: { group: typeof groups[number]; rows: LedgerRow[] }[] = []
    let n = 0
    for (const g of groups) {
      if (n >= limit) break
      const rows = collapsed.has(g.key) ? [] : g.rows.slice(0, limit - n)
      n += rows.length || 1
      out.push({ group: g, rows })
    }
    return out
  }, [groups, collapsed, limit])
  const flatShown = useMemo(() => shown.flatMap(s => s.rows), [shown])

  const total = visible.reduce((n, r) => n + r.total, 0)
  const kasBonCount = new Set(visible.map(r => r.header_id)).size
  const selectedRows = useMemo(() => allRows.filter(r => selected.has(r.id)), [allRows, selected])
  const selectedTotal = selectedRows.reduce((n, r) => n + r.total, 0)

  // Drop selections of lines that no longer exist (after a delete or undo).
  useEffect(() => {
    setSelected(s => {
      const ids = new Set(allRows.map(r => r.id))
      const next = new Set([...s].filter(id => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [allRows])
  useEffect(() => setLimit(PAGE), [filters])

  // The budget for what's shown, when there is one for exactly that.
  const budget = useMemo(() => {
    if (filters.period.mode !== 'month' || filters.q || filters.order !== 'any') return null
    const scopeBudgets = budgets.filter(b => b.scope === kind)
    if (kind === 'operation') return scopeBudgets.find(b => b.category === (filters.group || ''))?.amount ?? null
    if (filters.group) return null
    return scopeBudgets.find(b => b.category === '')?.amount ?? null
  }, [budgets, kind, filters])

  // ── Changes ────────────────────────────────────────────────────────────────
  const apply = (b: FinanceBatch, label: string, after?: () => void) =>
    batch.mutate({ batch: b, label }, { onSuccess: () => { setDialog(null); after?.() } })

  const editRow = (r: LedgerRow, field: EditField, value: unknown) => {
    if (field === 'order_id') {
      const v = String(value ?? '').trim().toUpperCase()
      if (v && !orders.some(o => o.id === v)) return void toast.error(`There's no order ${v}`)
      value = v || null
    }
    if (field === 'header_id') {
      const id = String(value).trim().toUpperCase()
      if (!id || id === r.header_id) return
      const b = editBatch([r], 'header_id', id)
      if (!headers.some(h => h.id === id)) b.headers = [{ id, date: r.date, description: r.description }]
      return apply(b, `Moved ${r.name || r.category} to ${id}`)
    }
    const what = field === 'date' || field === 'description' ? `the ${field} of ${r.header_id}` : `${r.name || r.category}`
    apply(editBatch([r], field, value), `Changed ${what}`)
  }

  const removeRows = (rows: LedgerRow[]) =>
    apply(deleteBatch(rows), rows.length === 1 ? `Deleted ${rows[0].name || rows[0].category}` : `Deleted ${rows.length} lines`, () => setSelected(new Set()))

  const duplicateRows = (rows: LedgerRow[]) => {
    const b: FinanceBatch = { production_create: [], operation_create: [] }
    for (const r of rows) {
      if (r.kind === 'production') b.production_create!.push({ header_id: r.header_id, material_name: r.name, supplier_id: r.supplier_id, amount: r.qty, si_unit: r.unit, price: r.price, order_id: r.order_id })
      else b.operation_create!.push({ header_id: r.header_id, category: r.category, description: r.name, price: r.price, order_id: r.order_id })
    }
    apply(b, `Copied ${rows.length} line${rows.length === 1 ? '' : 's'}`)
  }

  const exportRows = (rows: LedgerRow[], suffix = periodSlug(searchPeriod)) =>
    exportLedger(`${title} ${suffix}`, [ledgerSheet(title, rows, suppliers, orders)])

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggle = (id: number, shift: boolean) => {
    const anchor = lastClicked.current // read now: the updater below runs later
    setSelected(s => {
      const next = new Set(s)
      if (shift && anchor != null) {
        const a = flatShown.findIndex(r => r.id === anchor)
        const b = flatShown.findIndex(r => r.id === id)
        if (a >= 0 && b >= 0) {
          const on = !s.has(id)
          flatShown.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(r => (on ? next.add(r.id) : next.delete(r.id)))
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClicked.current = id
  }
  const setMany = (rows: LedgerRow[], on: boolean) =>
    setSelected(s => {
      const next = new Set(s)
      rows.forEach(r => (on ? next.add(r.id) : next.delete(r.id)))
      return next
    })
  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id))

  // ── Paste, and keyboard shortcuts ──────────────────────────────────────────
  const onPaste = (e: React.ClipboardEvent) => {
    if (isTyping(e.target)) return
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    const grid = parseDelimited(text, text.includes('\t') ? '\t' : undefined)
    if (!grid.length) return
    e.preventDefault()
    const guess = guessColumns(grid, kind, suppliers)
    // Rows that say which Kas Bon or date they belong to go through import;
    // plain lines open a new Kas Bon holding them.
    if (guess.targets.includes('header_id') || guess.targets.includes('date')) return setImportGrid(grid)
    const lines = readRows(grid, guess, suppliers).map(r => newDraft(kind, {
      name: r.name, category: r.category, unit: r.unit, qty: r.qty != null ? String(r.qty) : '1',
      price: r.price != null ? String(r.price) : '', ...(r.supplier_id ? { supplier_id: r.supplier_id } : {}),
    }))
    if (lines.length) setForm({ lines })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (form || importGrid !== undefined || dialog || editing) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault()
        undoLast(qc)
        return
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'n') { e.preventDefault(); setForm({}) }
      else if (e.key === 'Escape' && selected.size) setSelected(new Set())
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) { e.preventDefault(); setDialog('delete') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qc, form, importGrid, dialog, editing, selected.size])

  // ── Cell navigation (arrow keys between cells, like Excel) ─────────────────
  const cellRefs = useRef(new Map<string, HTMLElement>())
  const cellRef = (key: string) => (el: HTMLElement | null) => {
    if (el) cellRefs.current.set(key, el)
    else cellRefs.current.delete(key)
  }

  // ── Columns ────────────────────────────────────────────────────────────────
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: supplierWithCategory(s) }))
  const unitOptions = [...new Set([...SI_UNITS, ...allRows.map(r => r.unit).filter(Boolean)])].map(u => ({ value: u, label: u }))
  const orderSuggestions = useMemo(() => orders.slice(-300).map(o => o.id).reverse(), [orders])
  const headerSuggestions = useMemo(() => headers.slice(-300).map(h => h.id).reverse(), [headers])
  const byKasBon = filters.groupBy === 'kasbon'

  interface Col {
    key: string
    header: string
    width: string
    sortKey?: SortKey
    align?: 'right'
    field?: EditField
    type?: 'text' | 'number' | 'select' | 'date'
    options?: { value: string | number; label: string }[]
    suggestions?: string[]
    value: (r: LedgerRow) => string | number
    render?: (r: LedgerRow) => React.ReactNode
  }
  const money = (v: number) => <span className="font-mono tabular-nums">{formatRp(v)}</span>
  const columns: Col[] = [
    ...(!byKasBon ? [
      { key: 'header_id', header: 'Kas Bon', width: '6.5rem', sortKey: 'header_id' as SortKey, field: 'header_id' as EditField, type: 'text' as const, suggestions: headerSuggestions, value: (r: LedgerRow) => r.header_id, render: (r: LedgerRow) => <span className="font-mono text-xs">{r.header_id}</span> },
      { key: 'date', header: 'Date', width: '6.5rem', sortKey: 'date' as SortKey, field: 'date' as EditField, type: 'date' as const, value: (r: LedgerRow) => r.date.slice(0, 10), render: (r: LedgerRow) => <span className="text-xs text-slate-500">{formatDateShort(r.date)}</span> },
      { key: 'description', header: 'Description', width: '11rem', field: 'description' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.description, render: (r: LedgerRow) => <span className="text-slate-500">{r.description}</span> },
    ] : []),
    ...(kind === 'production' ? [
      { key: 'name', header: 'Bahan', width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name },
      { key: 'supplier', header: 'Supplier', width: '11rem', sortKey: 'group' as SortKey, field: 'supplier_id' as EditField, type: 'select' as const, options: supplierOptions, value: (r: LedgerRow) => r.supplier_id,
        render: (r: LedgerRow) => {
          const s = suppliers.find(x => x.id === r.supplier_id)
          return <span className="inline-flex items-center gap-1.5">{s && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[s.supplier_category] }} />}{s?.supplier_name ?? 'No supplier'}</span>
        } },
      { key: 'qty', header: 'Qty', width: '4.5rem', sortKey: 'qty' as SortKey, align: 'right' as const, field: 'qty' as EditField, type: 'number' as const, value: (r: LedgerRow) => r.qty, render: (r: LedgerRow) => <span className="tabular-nums">{r.qty.toLocaleString('id-ID')}</span> },
      { key: 'unit', header: 'Unit', width: '5rem', field: 'unit' as EditField, type: 'select' as const, options: unitOptions, value: (r: LedgerRow) => r.unit },
    ] : [
      { key: 'category', header: 'Category', width: '9rem', sortKey: 'group' as SortKey, field: 'category' as EditField, type: 'text' as const, suggestions: categories, value: (r: LedgerRow) => r.category },
      { key: 'name', header: 'Item', width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name },
    ]),
    { key: 'price', header: 'Price', width: '7.5rem', sortKey: 'price', align: 'right', field: 'price', type: 'number', value: r => r.price, render: r => money(r.price) },
    ...(kind === 'production' ? [{ key: 'total', header: 'Total', width: '8rem', sortKey: 'total' as SortKey, align: 'right' as const, value: (r: LedgerRow) => r.total, render: (r: LedgerRow) => <span className="font-mono tabular-nums font-semibold">{formatRp(r.total)}</span> }] : []),
    { key: 'order', header: 'Order', width: '8rem', sortKey: 'order_id', field: 'order_id', type: 'text', suggestions: orderSuggestions, value: r => r.order_id ?? '',
      render: r => (r.order_id ? <span className="font-mono text-xs text-navy-700" title={orderLabel(orders, r.order_id)}>{r.order_id}</span> : <span className="text-slate-300">—</span>) },
  ]

  const moveFocus = (rowId: number, col: number, dRow: number, dCol: number) => {
    const i = flatShown.findIndex(r => r.id === rowId)
    const row = flatShown[Math.min(Math.max(i + dRow, 0), flatShown.length - 1)]
    const c = Math.min(Math.max(col + dCol, 0), columns.length - 1)
    if (row) cellRefs.current.get(`${row.id}:${c}`)?.focus()
  }

  const sortBy = (key?: SortKey) => key && setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'price' ? 'desc' : 'asc' }))

  // ── Rendering ──────────────────────────────────────────────────────────────
  if (source.isLoading) return <Spinner />
  if (source.isError) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
        <p className="text-red-400 mb-3">Couldn't load the {kind} lines. Check the connection and try again.</p>
        <button onClick={() => source.refetch()} className="btn-secondary">Retry</button>
      </div>
    )
  }

  const groupHeader = (key: string, rows: LedgerRow[]) => {
    const sum = rows.reduce((n, r) => n + r.total, 0)
    if (filters.groupBy === 'kasbon') {
      const first = rows[0]
      const others = otherCount.get(key) ?? 0
      return (
        <>
          <span className="font-mono font-semibold text-navy-900">{key}</span>
          <span className="text-slate-500 truncate">{first.description || 'No description'}</span>
          <span className="text-slate-400 text-xs whitespace-nowrap">{formatDateShort(first.date)}</span>
          {others > 0 && <span className="badge-slate !text-[10px]" title={`This Kas Bon also has ${others} ${kind === 'production' ? 'operation' : 'production'} line(s)`}>+{others} {kind === 'production' ? 'ops' : 'bahan'}</span>}
          <span className="ml-auto font-mono tabular-nums text-slate-700">{formatRp(sum)}</span>
        </>
      )
    }
    const label = filters.groupBy === 'order'
      ? (key ? orderLabel(orders, key) : 'Not linked to an order')
      : kind === 'production' ? supplierLabel(suppliers, Number(key)) : key || 'Uncategorized'
    return (
      <>
        <span className="font-semibold text-navy-900">{label}</span>
        <span className="text-slate-400 text-xs">{rows.length} line{rows.length === 1 ? '' : 's'}</span>
        <span className="ml-auto font-mono tabular-nums text-slate-700">{formatRp(sum)}</span>
      </>
    )
  }

  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  const groupOptions = kind === 'production'
    ? suppliers.map(s => ({ value: String(s.id), label: supplierWithCategory(s) }))
    : categories.map(c => ({ value: c, label: c }))

  return (
    <div className="p-4 md:p-6 space-y-4" onPaste={onPaste}>
      {/* Title and actions */}
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to dashboard">
            <ChevronRight size={18} className="rotate-180" />
          </button>
        )}
        {icon}
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setImportGrid(null)} title="Import from Excel or CSV"><FileUp size={14} /><span className="hidden sm:inline">Import</span></button>
          <button className="btn-secondary btn-sm" onClick={() => exportRows(sorted)} disabled={!visible.length} title="Download what's shown as Excel"><Download size={14} /><span className="hidden sm:inline">Export</span></button>
          <button className="btn-primary btn-sm" onClick={() => setForm({})} title="New Kas Bon (N)"><Plus size={14} /> New Kas Bon</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            className="field !pl-8 !py-1.5"
            placeholder="Search everything…   /"
            value={filters.q}
            onChange={e => setFilter('q', e.target.value)}
          />
          {filters.q && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setFilter('q', '')} aria-label="Clear search"><X size={14} /></button>}
        </div>
        <PeriodPicker value={filters.period} onChange={p => setFilter('period', p)} />
        <select className="field !w-auto !py-1.5 text-xs max-w-[12rem]" value={filters.group} onChange={e => setFilter('group', e.target.value)} aria-label={kind === 'production' ? 'Supplier' : 'Category'}>
          <option value="">{kind === 'production' ? 'All suppliers' : 'All categories'}</option>
          {groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="field !w-auto !py-1.5 text-xs max-w-[11rem]" value={filters.order} onChange={e => setFilter('order', e.target.value)} aria-label="Order link">
          <option value="any">Any order</option>
          <option value="linked">Linked to an order</option>
          <option value="none">Not linked</option>
          {[...new Set([...(['any', 'none', 'linked'].includes(filters.order) ? [] : [filters.order]), ...orders.slice(-100).reverse().map(o => o.id)])]
            .map(id => <option key={id} value={id}>{orderLabel(orders, id)}</option>)}
        </select>
        <select className="field !w-auto !py-1.5 text-xs" value={filters.groupBy} onChange={e => setFilter('groupBy', e.target.value as GroupBy)} aria-label="Group by">
          <option value="kasbon">Group: Kas Bon</option>
          <option value="group">Group: {kind === 'production' ? 'supplier' : 'category'}</option>
          <option value="order">Group: order</option>
          <option value="none">No groups</option>
        </select>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1">
        <span className="text-2xl font-semibold text-navy-900 font-mono tabular-nums">{formatRp(total)}</span>
        <span className="text-sm text-slate-500">
          {visible.length} line{visible.length === 1 ? '' : 's'} · {kasBonCount} Kas Bon · {searching ? 'all months' : periodLabel(searchPeriod)}
        </span>
        {change != null && Number.isFinite(change) && (
          <span className={`text-xs font-medium ${change > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change)}% vs {prevName}
          </span>
        )}
        {budget != null && (
          <span className="flex items-center gap-2 text-xs text-slate-500 min-w-[14rem]">
            Budget {formatRp(budget)}
            <span className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <span className={`block h-full rounded-full ${total > budget ? 'bg-red-500' : total > budget * 0.8 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (total / budget) * 100)}%` }} />
            </span>
            <span className={total > budget ? 'text-red-600 font-medium' : ''}>{Math.round((total / budget) * 100)}%</span>
          </span>
        )}
      </div>

      {!visible.length ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          {allRows.length ? 'Nothing matches. Try another period, or clear the search and filters.' : 'No lines yet.'}
          <div className="mt-3 flex justify-center gap-2">
            <button className="btn-primary btn-sm" onClick={() => setForm({})}><Plus size={14} /> New Kas Bon</button>
            <button className="btn-secondary btn-sm" onClick={() => setImportGrid(null)}><FileUp size={14} /> Import</button>
          </div>
          <p className="mt-3 text-xs">Tip: copy rows in Excel and press Ctrl+V here to bring them in.</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className={`btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}>
              <CheckSquare size={14} /> {selectMode ? 'Done' : 'Select'}
            </button>
          </div>
          {shown.map(({ group, rows }) => (
            <div key={group.key || 'all'} className="card overflow-hidden">
              {filters.groupBy !== 'none' && (
                <button className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 bg-slate-50 text-sm text-left" onClick={() => setCollapsed(c => { const n = new Set(c); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n })}>
                  {groupHeader(group.key, group.rows)}
                </button>
              )}
              <ul className="divide-y divide-slate-100">
                {rows.map(r => (
                  <li key={r.id}>
                    <button
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left ${selected.has(r.id) ? 'bg-navy-50' : ''}`}
                      onClick={() => (selectMode ? toggle(r.id, false) : setEditing(r))}
                    >
                      {selectMode && <input type="checkbox" readOnly checked={selected.has(r.id)} className="mt-1" />}
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-slate-800 truncate">{r.name || r.category}</span>
                        <span className="block text-xs text-slate-400 truncate">
                          {kind === 'production' ? `${supplierLabel(suppliers, r.supplier_id)} · ${r.qty.toLocaleString('id-ID')} ${r.unit} × ${formatRp(r.price)}` : r.category}
                          {!byKasBon && ` · ${r.header_id} · ${formatDateShort(r.date)}`}
                          {r.order_id && ` · ${r.order_id}`}
                        </span>
                      </span>
                      <span className="font-mono text-sm tabular-nums text-navy-900">{formatRp(r.total)}</span>
                    </button>
                  </li>
                ))}
                {byKasBon && rows.length > 0 && (
                  <li><button className="w-full px-4 py-2 text-xs text-navy-600 text-left" onClick={() => setForm({ headerId: group.key })}><Plus size={12} className="inline" /> Add lines</button></li>
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '2.25rem' }} />
                {columns.map(c => <col key={c.key} style={c.width === 'auto' ? undefined : { width: c.width }} />)}
                <col style={{ width: '2.25rem' }} />
              </colgroup>
              <thead className="bg-slate-50 sticky top-0 z-20 shadow-[0_1px_0_#f1f5f9]">
                <tr>
                  <th className="px-2 py-2.5">
                    <input type="checkbox" aria-label="Select everything shown" checked={allVisibleSelected} onChange={e => setMany(visible, e.target.checked)} />
                  </th>
                  {columns.map(c => (
                    <th key={c.key} className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {c.sortKey ? (
                        <button className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 ${sort.key === c.sortKey ? 'text-navy-700' : ''}`} onClick={() => sortBy(c.sortKey)}>
                          {c.header}
                          {sort.key === c.sortKey && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </button>
                      ) : c.header}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ group, rows }) => {
                  const isCollapsed = collapsed.has(group.key)
                  const allIn = group.rows.every(r => selected.has(r.id))
                  return (
                    <React.Fragment key={group.key || 'all'}>
                      {filters.groupBy !== 'none' && (
                        <tr className="bg-slate-50/90 border-y border-slate-100 group/gh">
                          <td className="px-2 py-2">
                            <input type="checkbox" aria-label="Select this group" checked={allIn} onChange={e => setMany(group.rows, e.target.checked)} />
                          </td>
                          <td colSpan={columns.length} className="px-2 py-2">
                            <div className="flex items-center gap-2.5 text-sm min-w-0">
                              <button onClick={() => setCollapsed(c => { const n = new Set(c); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n })} className="text-slate-400 hover:text-slate-700" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
                                <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                              </button>
                              {groupHeader(group.key, group.rows)}
                            </div>
                          </td>
                          <td className="px-1 text-center">
                            {byKasBon && (
                              <button className="opacity-0 group-hover/gh:opacity-100 text-slate-400 hover:text-navy-700" title={`Add lines to ${group.key}`} onClick={() => setForm({ headerId: group.key })}>
                                <Plus size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                      {rows.map(r => (
                        <tr key={r.id} className={`border-b border-slate-50 group ${selected.has(r.id) ? 'bg-navy-50/70' : 'hover:bg-slate-50/60'}`}>
                          <td className="px-2 py-1">
                            <input type="checkbox" aria-label="Select line" checked={selected.has(r.id)} onChange={() => undefined} onClick={e => toggle(r.id, e.shiftKey)} />
                          </td>
                          {columns.map((c, ci) => (
                            <td key={c.key} className={`px-1 py-0.5 truncate ${c.align === 'right' ? 'text-right' : ''}`}>
                              {c.field ? (
                                <EditableCell
                                  value={c.value(r)}
                                  type={c.type}
                                  options={c.options}
                                  suggestions={c.suggestions}
                                  allowDecimal={c.field === 'qty'}
                                  uppercase={c.type === 'text'}
                                  placeholder="—"
                                  format={() => (c.render ? c.render(r) : c.value(r))}
                                  onSave={v => editRow(r, c.field!, v)}
                                  cellRef={cellRef(`${r.id}:${ci}`)}
                                  onNavigate={(dr, dc) => moveFocus(r.id, ci, dr, dc)}
                                />
                              ) : (
                                <div ref={cellRef(`${r.id}:${ci}`)} tabIndex={0} className="px-2 py-1 focus:outline-none focus:bg-navy-50/50 rounded-sm"
                                  onKeyDown={e => {
                                    const d = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[e.key]
                                    if (d) { e.preventDefault(); moveFocus(r.id, ci, d[0], d[1]) }
                                  }}>
                                  {c.render ? c.render(r) : c.value(r)}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-1 text-center">
                            <button onClick={() => removeRows([r])} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-300 hover:text-red-500" title="Delete line (undo with Ctrl+Z)">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {flatShown.length < visible.length && (
              <div className="p-3 text-center border-t border-slate-100">
                <button className="btn-secondary btn-sm" onClick={() => setLimit(l => l + PAGE)}>Show more ({visible.length - flatShown.length} left)</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-400">
            <span>Click a cell to edit · arrows move · shift-click selects a range · Ctrl+V pastes rows from Excel · Ctrl+Z undoes</span>
            <span className="ml-auto font-mono text-sm text-navy-900 font-semibold tabular-nums">{formatRp(total)}</span>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 pointer-events-none md:left-[240px]" data-bulk-bar>
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-navy-900 text-white shadow-2xl px-3 py-2 max-w-full">
            <span className="px-2 text-sm"><span className="font-semibold">{selected.size}</span> selected · <span className="font-mono">{formatRp(selectedTotal)}</span></span>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('move')}><ArrowRightLeft size={13} /> Move</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog(kind === 'production' ? 'supplier_id' : 'category')}><Tag size={13} /> {kind === 'production' ? 'Supplier' : 'Category'}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('order_id')}><Link2 size={13} /> Order</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => duplicateRows(selectedRows)}><Copy size={13} /> Copy</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => exportRows(selectedRows, 'selection')}><Download size={13} /> Export</button>
            <button className="btn-sm btn rounded-lg text-red-200 hover:bg-red-500/20" onClick={() => setDialog('delete')}><Trash2 size={13} /> Delete</button>
            <button className="p-1.5 rounded-lg hover:bg-white/10" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X size={14} /></button>
          </div>
        </div>
      )}

      {form && (
        <KasBonForm kind={kind} headers={headers} suppliers={suppliers} orders={orders} categories={categories}
          headerId={form.headerId} lines={form.lines}
          defaultSupplierId={kind === 'production' && filters.group ? Number(filters.group) : undefined}
          onClose={() => setForm(null)} />
      )}
      {importGrid !== undefined && (
        <ImportDialog kind={kind} headers={headers} suppliers={suppliers} orders={orders} initialGrid={importGrid ?? undefined} onClose={() => setImportGrid(undefined)} />
      )}
      {dialog === 'move' && <MoveDialog rows={selectedRows} headers={headers} onApply={(b, l) => apply(b, l)} onClose={() => setDialog(null)} />}
      {(dialog === 'supplier_id' || dialog === 'category' || dialog === 'order_id') && (
        <SetFieldDialog rows={selectedRows} field={dialog} suppliers={suppliers} orders={orders} categories={categories} onApply={(b, l) => apply(b, l)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          message={`Delete ${selected.size} line${selected.size === 1 ? '' : 's'} (${formatRp(selectedTotal)})? You can undo this right after.`}
          onConfirm={() => removeRows(selectedRows)}
          onCancel={() => setDialog(null)}
        />
      )}
      {editing && (
        <LineEditor row={editing} suppliers={suppliers} orders={orders} categories={categories}
          onApply={(b, l) => apply(b, l, () => setEditing(null))}
          onDelete={() => { removeRows([editing]); setEditing(null) }}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
