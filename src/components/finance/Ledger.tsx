import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowDown, ArrowUp, ChevronRight, Download, FileUp, Link2, Plus, Printer, Search, Trash2, X,
  ArrowRightLeft, Tag, Copy, CheckSquare, Pencil, Palette,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EditableCell, formatRp } from '@/components/ui'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/Page'
import { ConfirmDialog } from '@/components/ui'
import {
  productionHooks, operationHooks, supplierHooks, orderHooks, useFinanceHeaders, useFinanceBatch, undoLast, useBudgets,
} from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SI_UNITS } from '@/utils/Units'
import { formatDateShort, shortMonthLabel as monthShort, monthLabel } from '@/utils/MonthUtils'
import { parseDelimited } from '@/utils/tableText'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import { colorFromText, catalogueForSupplier, materialFromText, materialLabel, colorCodeFromText } from '@/data/materialCatalogue'
import type { CatalogueMaterial, CatalogueColor } from '@/data/materialCatalogue'
import { MaterialColorPickerModal } from './MaterialColorPicker'
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
import { isTyping } from '@/utils/isTyping'

type GroupBy = 'kasbon' | 'group' | 'order' | 'none'
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

/** The Production or Operations spreadsheet: every Kas Bon line, searchable
 *  across months, editable in place, with bulk changes, paste from Excel,
 *  import/export and undo. */
export function Ledger({ kind, initial, title, icon }: {
  kind: Kind
  initial?: Partial<LedgerFilters>
  title: string
  icon: LucideIcon
}) {
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const navigate = useNavigate()
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
  // The desktop table's swatch/palette icon in the Bahan column opens the
  // colour grid directly on click, rather than needing the row's own name
  // cell (plain text editing) or the separate Edit-line dialog first —
  // clicking the swatch itself didn't do anything before this.
  const [colorPickFor, setColorPickFor] = useState<{ row: LedgerRow; material: CatalogueMaterial; colors: CatalogueColor[]; selectedCode?: string } | null>(null)
  // A single line's delete also confirms first — unlike the bulk one above,
  // it has no selecting-then-clicking-Delete step of its own to catch a
  // mis-click, just the one small icon.
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<LedgerRow | null>(null)
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
  const groupOf = useCallback((r: LedgerRow) => (kind === 'production' ? String(r.supplier_id) : r.category), [kind])
  const passesBase = useCallback((r: LedgerRow, period: Period) => {
    if (!inPeriod(r.date, period)) return false
    if (filters.order === 'none' && r.order_id) return false
    if (filters.order === 'linked' && !r.order_id) return false
    if (!['any', 'none', 'linked'].includes(filters.order) && r.order_id !== filters.order) return false
    return !filters.q || matchesSearch(texts.get(r.id) ?? '', filters.q)
  }, [filters, texts])
  const passes = useCallback((r: LedgerRow, period: Period) =>
    passesBase(r, period) && (!filters.group || groupOf(r) === filters.group), [passesBase, filters.group, groupOf])

  // A search looks through every month; the period still applies otherwise.
  const searching = !!filters.q.trim() && filters.period.mode === 'month'
  const searchPeriod = useMemo<Period>(() => (searching ? { ...filters.period, mode: 'all' } : filters.period), [searching, filters.period])
  const visible = useMemo(() => allRows.filter(r => passes(r, searchPeriod)), [allRows, passes, searchPeriod])
  // Spend per supplier (or category) for everything else in the filters, to
  // pick one from.
  const groupTotals = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of allRows) if (passesBase(r, searchPeriod)) sums.set(groupOf(r), (sums.get(groupOf(r)) ?? 0) + r.total)
    return [...sums.entries()].sort((a, b) => b[1] - a[1])
  }, [allRows, passesBase, searchPeriod, groupOf])
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

  // Viewing a whole year, grouped by Kas Bon, would otherwise just be every
  // single Kas Bon of the year listed flat — a lot to scroll past with no
  // sense of "what month am I looking at". A plain, non-editable divider
  // row before each month's first Kas Bon — "January 2026 · 01/KB/26 –
  // 25/KB/26" — gives that same "a few Kas Bon a month" shape the paper/
  // Excel process already has, without turning this into a second level of
  // real grouping (collapsing, selection, etc. all stay exactly Kas-Bon-
  // scoped; this is purely a label inserted between them at render time).
  const monthDividers = useMemo(() => {
    const result = new Map<string, string>() // group.key -> label shown above it
    if (filters.period.mode !== 'year' || filters.groupBy !== 'kasbon') return result
    const idsByMonth = new Map<string, string[]>()
    const monthOf = new Map<string, string>()
    for (const g of groups) {
      const first = g.rows[0]
      if (!first) continue
      const d = new Date(first.date)
      if (isNaN(d.getTime())) continue
      const mk = `${d.getFullYear()}-${d.getMonth()}`
      monthOf.set(g.key, mk)
      if (!idsByMonth.has(mk)) idsByMonth.set(mk, [])
      idsByMonth.get(mk)!.push(g.key)
    }
    let lastMonth: string | null = null
    for (const g of groups) {
      const mk = monthOf.get(g.key)
      if (mk == null || mk === lastMonth) continue
      lastMonth = mk
      const [y, m] = mk.split('-').map(Number)
      const ids = [...(idsByMonth.get(mk) ?? [])].sort((a, b) => kasBonOrder(a) - kasBonOrder(b))
      const range = ids.length > 1 ? `${ids[0]} – ${ids[ids.length - 1]}` : ids[0]
      result.set(g.key, `${monthLabel(y, m)} · ${range}`)
    }
    return result
  }, [groups, filters.period.mode, filters.groupBy])

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
    if (field === 'date') {
      const d = String(value ?? '').trim()
      if (!d || Number.isNaN(new Date(d).getTime())) return void toast.error('Date is required')
      value = d
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
      { key: 'date', header: 'Date', width: '6.5rem', sortKey: 'date' as SortKey, field: 'date' as EditField, type: 'date' as const, value: (r: LedgerRow) => r.date.slice(0, 10), render: (r: LedgerRow) => <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{formatDateShort(r.date)}</span> },
      { key: 'description', header: 'Description', width: '11rem', field: 'description' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.description, render: (r: LedgerRow) => <span className="text-slate-600 dark:text-slate-300">{r.description}</span> },
    ] : []),
    ...(kind === 'production' ? [
      { key: 'name', header: 'Bahan', width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name,
        render: (r: LedgerRow) => {
          // A swatch for whatever colour is already baked into this line's
          // own name ("… - CODE"), the same code a Kas Bon line's colour
          // picker would have appended — so a known colour reads at a
          // glance on the sheet itself, not only while editing the line.
          // Clickable (stopping the cell's own click-to-edit-text behavior)
          // so it opens the colour grid directly — the swatch used to be
          // purely decorative, which read as broken when clicking it did
          // nothing. A muted palette icon stands in before any colour has
          // been picked yet, so a first-time pick doesn't need the Edit-
          // line dialog either.
          const catalogue = catalogueForSupplier(supplierLabel(suppliers, r.supplier_id))
          const catMatch = catalogue ? materialFromText(catalogue, r.name) : undefined
          const catColors = catalogue && catMatch ? catalogue.colorsFor(catMatch) : []
          const catCode = catMatch ? colorCodeFromText(catMatch, r.name) : undefined
          const c = catCode ? catColors.find(x => x.code === catCode) : undefined
          return (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {catMatch && catColors.length > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setColorPickFor({ row: r, material: catMatch, colors: catColors, selectedCode: catCode }) }}
                  className="shrink-0 rounded-full"
                  title={c ? `${c.code}${c.category ? ` · ${c.category}` : ''} — click to change` : 'Pick a colour'}
                >
                  {c
                    ? <span className="block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 hover:ring-2 hover:ring-navy-400" style={{ background: c.hex }} />
                    : <Palette size={12} className="text-slate-300 hover:text-navy-600 dark:text-navy-700 dark:hover:text-slate-300" />}
                </button>
              )}
              <span className="font-medium text-slate-800 truncate dark:text-slate-200">{r.name}</span>
            </span>
          )
        } },
      { key: 'supplier', header: 'Supplier', width: '11rem', sortKey: 'group' as SortKey, field: 'supplier_id' as EditField, type: 'select' as const, options: supplierOptions, value: (r: LedgerRow) => r.supplier_id,
        render: (r: LedgerRow) => {
          const s = suppliers.find(x => x.id === r.supplier_id)
          return <span className="inline-flex items-center gap-1.5">{s && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[s.supplier_category] }} />}{s?.supplier_name ?? 'No supplier'}</span>
        } },
      { key: 'qty', header: 'Qty', width: '4.5rem', sortKey: 'qty' as SortKey, align: 'right' as const, field: 'qty' as EditField, type: 'number' as const, value: (r: LedgerRow) => r.qty, render: (r: LedgerRow) => <span className="tabular-nums">{r.qty.toLocaleString('id-ID')}</span> },
      { key: 'unit', header: 'Unit', width: '5rem', field: 'unit' as EditField, type: 'select' as const, options: unitOptions, value: (r: LedgerRow) => r.unit },
    ] : [
      { key: 'category', header: 'Category', width: '9rem', sortKey: 'group' as SortKey, field: 'category' as EditField, type: 'text' as const, suggestions: categories, value: (r: LedgerRow) => r.category },
      { key: 'name', header: 'Item', width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name, render: (r: LedgerRow) => <span className="font-medium text-slate-800 dark:text-slate-200">{r.name}</span> },
    ]),
    { key: 'price', header: 'Price', width: '7.5rem', sortKey: 'price', align: 'right', field: 'price', type: 'number', value: r => r.price, render: r => money(r.price) },
    ...(kind === 'production' ? [{ key: 'total', header: 'Total', width: '8rem', sortKey: 'total' as SortKey, align: 'right' as const, value: (r: LedgerRow) => r.total, render: (r: LedgerRow) => <span className="font-mono tabular-nums font-semibold">{formatRp(r.total)}</span> }] : []),
    { key: 'order', header: 'Order', width: '8rem', sortKey: 'order_id', field: 'order_id', type: 'text', suggestions: orderSuggestions, value: r => r.order_id ?? '',
      render: r => (r.order_id ? <span className="font-mono text-xs text-navy-700 dark:text-slate-200" title={orderLabel(orders, r.order_id)}>{r.order_id}</span> : <span className="text-slate-300 dark:text-navy-700">—</span>) },
  ]

  const moveFocus = (rowId: number, col: number, dRow: number, dCol: number) => {
    const i = flatShown.findIndex(r => r.id === rowId)
    const row = flatShown[Math.min(Math.max(i + dRow, 0), flatShown.length - 1)]
    const c = Math.min(Math.max(col + dCol, 0), columns.length - 1)
    if (row) cellRefs.current.get(`${row.id}:${c}`)?.focus()
  }

  const sortBy = (key?: SortKey) => key && setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'price' ? 'desc' : 'asc' }))

  // ── Rendering ──────────────────────────────────────────────────────────────
  if (source.isLoading) return <LoadingState label={`Loading the ${kind} lines…`} />
  if (source.isError) return <div className="p-4 md:p-6"><div className="card"><ErrorState what={`the ${kind} lines`} onRetry={() => source.refetch()} /></div></div>

  // The group's running sum: a separate value from the label content below,
  // since the desktop table now places it in its own cell aligned under a
  // real column (Total, or Price when there's no Total column) instead of
  // floating it to the row's far right — which used to land it right under
  // the Order column header and read as if it were an order-related figure.
  const groupSum = (rows: LedgerRow[]) => rows.reduce((n, r) => n + r.total, 0)
  const groupHeader = (key: string, rows: LedgerRow[]) => {
    if (filters.groupBy === 'kasbon') {
      const first = rows[0]
      const others = otherCount.get(key) ?? 0
      // A Kas Bon with exactly one line has nothing to summarize — the line
      // right below already says everything this header's total would, so
      // that figure is left out for it (the caller decides this; see its
      // own comment). The heading itself stays the same size either way:
      // the Kas Bon is the real-world container (a physical voucher), and
      // varying how big its own id looks depending on how many lines happen
      // to be under it reads as arbitrary, not meaningful, when scanning
      // several of them in a row.
      return (
        <>
          <span className="font-mono text-base font-bold text-navy-900 dark:text-slate-50">{key}</span>
          <span className="text-sm text-slate-500 truncate dark:text-slate-400">{first.description || 'No description'}</span>
          <span className="text-slate-500 text-xs whitespace-nowrap dark:text-slate-400">{formatDateShort(first.date)}</span>
          {others > 0 && <span className="badge-slate !text-[10px]" title={`This Kas Bon also has ${others} ${kind === 'production' ? 'operation' : 'production'} line(s)`}>+{others} {kind === 'production' ? 'ops' : 'bahan'}</span>}
        </>
      )
    }
    const label = filters.groupBy === 'order'
      ? (key ? orderLabel(orders, key) : 'Not linked to an order')
      : kind === 'production' ? supplierLabel(suppliers, Number(key)) : key || 'Uncategorized'
    return (
      <>
        <span className="font-semibold text-navy-900 dark:text-slate-50">{label}</span>
        <span className="text-slate-500 text-xs dark:text-slate-400">{rows.length} line{rows.length === 1 ? '' : 's'}</span>
      </>
    )
  }
  // Which column the group sum lines up under: Total for production (bahan),
  // or Price for operations, which has no separate Total column of its own.
  // 'price' always exists in both kinds' column lists, so this is never -1.
  const sumColIndex = columns.findIndex(c => c.key === 'total') !== -1
    ? columns.findIndex(c => c.key === 'total')
    : columns.findIndex(c => c.key === 'price')

  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  const groupOptions = kind === 'production'
    ? suppliers.map(s => ({ value: String(s.id), label: supplierWithCategory(s) }))
    : categories.map(c => ({ value: c, label: c }))

  return (
    <div className="p-4 md:p-6 space-y-4" onPaste={onPaste}>
      <PageHeader
        icon={icon}
        title={title}
        subtitle={kind === 'production' ? 'Bahan bought, Kas Bon by Kas Bon' : 'Running costs, Kas Bon by Kas Bon'}
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setImportGrid(null)} title="Import from Excel or CSV"><FileUp size={14} /><span className="hidden sm:inline">Import</span></button>
            <button className="btn-secondary btn-sm" onClick={() => exportRows(sorted)} disabled={!visible.length} title="Download what's shown as Excel"><Download size={14} /><span className="hidden sm:inline">Export</span></button>
            <button
              className="btn-secondary btn-sm"
              disabled={!visible.length}
              title="Print this period’s Kas Bon"
              onClick={() => {
                const p = filters.period
                const qs = p.mode === 'range'
                  ? `mode=range&from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}`
                  : p.mode === 'all' ? 'mode=all'
                  : `mode=${p.mode}&year=${p.year}&month=${p.month}`
                navigate(`/finance/kasbon/print?${qs}`)
              }}
            >
              <Printer size={14} /><span className="hidden sm:inline">Print</span>
            </button>
            <button className="btn-primary btn-sm" onClick={() => setForm({})} title="New Kas Bon (N)"><Plus size={14} /> New Kas Bon</button>
          </>
        }
      />

      {/* Filters */}
      <div className="card p-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            ref={searchRef}
            className="field !pl-8 !py-1.5"
            placeholder="Search everything…   /"
            value={filters.q}
            onChange={e => setFilter('q', e.target.value)}
          />
          {filters.q && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300" onClick={() => setFilter('q', '')} aria-label="Clear search"><X size={14} /></button>}
        </div>
        <PeriodPicker value={filters.period} onChange={p => setFilter('period', p)} />
        {/* A deliberate 2-up grid below `sm:`, Group-by spanning the full
           second row — the three selects used to each land alone on their
           own full-width-looking line (auto-width inside a wrapped flex
           row, with nothing beside them), every one a different width with
           empty space trailing it. `sm:contents` drops this wrapper from
           layout entirely from `sm:` up, so desktop is exactly as before:
           each select flows inline in the filter bar's own flex-wrap row. */}
        <div className="grid grid-cols-2 gap-2 w-full sm:contents">
          <select className="field !w-full sm:!w-auto !py-1.5 text-xs sm:max-w-[12rem]" value={filters.group} onChange={e => setFilter('group', e.target.value)} aria-label={kind === 'production' ? 'Supplier' : 'Category'}>
            <option value="">{kind === 'production' ? 'All suppliers' : 'All categories'}</option>
            {groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="field !w-full sm:!w-auto !py-1.5 text-xs sm:max-w-[11rem]" value={filters.order} onChange={e => setFilter('order', e.target.value)} aria-label="Order link">
            <option value="any">Any order</option>
            <option value="linked">Linked to an order</option>
            <option value="none">Not linked</option>
            {[...new Set([...(['any', 'none', 'linked'].includes(filters.order) ? [] : [filters.order]), ...orders.slice(-100).reverse().map(o => o.id)])]
              .map(id => <option key={id} value={id}>{orderLabel(orders, id)}</option>)}
          </select>
          <select className="field !w-full sm:!w-auto !py-1.5 text-xs col-span-2 sm:col-span-1" value={filters.groupBy} onChange={e => setFilter('groupBy', e.target.value as GroupBy)} aria-label="Group by">
            <option value="kasbon">Group: Kas Bon</option>
            <option value="group">Group: {kind === 'production' ? 'supplier' : 'category'}</option>
            <option value="order">Group: order</option>
            <option value="none">No groups</option>
          </select>
        </div>
      </div>

      {/* Summary: the total, how it compares, and where it went */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl font-semibold text-navy-900 font-mono tabular-nums dark:text-slate-50">{formatRp(total)}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {visible.length} line{visible.length === 1 ? '' : 's'} · {kasBonCount} Kas Bon · {searching ? 'all months' : periodLabel(searchPeriod)}
          </span>
          {change != null && Number.isFinite(change) && (
            <span className={`text-xs font-medium ${change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {change > 0 ? '▲' : '▼'} {Math.abs(change)}% vs {prevName}
            </span>
          )}
          {budget != null && (
            <span className="flex items-center gap-2 text-xs text-slate-500 min-w-[14rem] ml-auto dark:text-slate-400">
              Budget {formatRp(budget)}
              <span className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
                <span className={`block h-full rounded-full ${total > budget ? 'bg-red-500' : total > budget * 0.8 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (total / budget) * 100)}%` }} />
              </span>
              <span className={total > budget ? 'text-red-600 font-medium dark:text-red-400' : ''}>{Math.round((total / budget) * 100)}%</span>
            </span>
          )}
        </div>
        {groupTotals.length > 1 && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            {groupTotals.slice(0, 12).map(([key, sum]) => {
              const on = filters.group === key
              const max = groupTotals[0][1] || 1
              const s = kind === 'production' ? suppliers.find(x => x.id === Number(key)) : undefined
              return (
                <button
                  key={key || 'none'}
                  onClick={() => setFilter('group', on ? '' : key)}
                  className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${on ? 'border-navy-900 bg-navy-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                  title={on ? 'Show all again' : `Only ${kind === 'production' ? 'this supplier' : 'this category'}`}
                >
                  <span className="flex items-center gap-1.5 text-xs text-slate-600 truncate dark:text-slate-300">
                    {s && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[s.supplier_category] }} />}
                    <span className="truncate">{kind === 'production' ? supplierLabel(suppliers, Number(key)) : key || 'Uncategorized'}</span>
                  </span>
                  <span className="block font-mono text-sm tabular-nums text-navy-900 dark:text-slate-50">{formatRp(sum)}</span>
                  <span className="block h-1 mt-1 rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
                    <span className="block h-full rounded-full bg-navy-500" style={{ width: `${(sum / max) * 100}%` }} />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!visible.length ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
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
          {shown.map(({ group, rows }) => {
            const solo = filters.groupBy === 'kasbon' && group.rows.length === 1
            const monthDivider = monthDividers.get(group.key)
            return (
            <div key={group.key || 'all'}>
              {monthDivider && (
                <div className="px-1 py-2 text-lg text-center font-bold uppercase tracking-wide text-navy-900 bg-gold-400/15 border-b-2 border-gold-500 dark:text-gold-300 dark:bg-gold-500/10 dark:border-gold-500/40">{monthDivider}</div>
              )}
              <div className="card overflow-hidden">
              {filters.groupBy !== 'none' && (
                <button className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 bg-slate-50 text-sm text-left dark:bg-navy-950" onClick={() => setCollapsed(c => { const n = new Set(c); if (n.has(group.key)) n.delete(group.key); else n.add(group.key); return n })}>
                  {groupHeader(group.key, group.rows)}
                  {/* Solo line's own card row already shows this total below. */}
                  {!solo && <span className="ml-auto font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500">{formatRp(groupSum(group.rows))}</span>}
                </button>
              )}
              <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                {rows.map(r => (
                  <li key={r.id}>
                    <button
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left ${selected.has(r.id) ? 'bg-navy-50' : ''}`}
                      onClick={() => (selectMode ? toggle(r.id, false) : setEditing(r))}
                    >
                      {selectMode && <input type="checkbox" readOnly checked={selected.has(r.id)} className="mt-1" />}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {kind === 'production' && (() => {
                            const c = colorFromText(supplierLabel(suppliers, r.supplier_id), r.name)
                            return c && <span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 shrink-0" style={{ background: c.hex }} />
                          })()}
                          <span className="block font-medium text-slate-800 truncate dark:text-slate-200">{r.name || r.category}</span>
                        </span>
                        <span className="block text-xs text-slate-500 truncate dark:text-slate-400">
                          {kind === 'production' ? `${supplierLabel(suppliers, r.supplier_id)} · ${r.qty.toLocaleString('id-ID')} ${r.unit} × ${formatRp(r.price)}` : r.category}
                          {!byKasBon && ` · ${r.header_id} · ${formatDateShort(r.date)}`}
                          {r.order_id && ` · ${r.order_id}`}
                        </span>
                      </span>
                      <span className="font-mono text-sm tabular-nums text-navy-900 dark:text-slate-50">{formatRp(r.total)}</span>
                    </button>
                  </li>
                ))}
                {byKasBon && rows.length > 0 && (
                  <li><button className="w-full px-4 py-2 text-xs text-navy-600 text-left dark:text-navy-300" onClick={() => setForm({ headerId: group.key })}><Plus size={12} className="inline" /> Add lines</button></li>
                )}
              </ul>
              </div>
            </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '2.25rem' }} />
                {/* 'auto' (Bahan/Item) gets a floor, not left unconstrained: with
                    table-layout:fixed and the table only min-width:100% (not a
                    hard 100%), an unconstrained column can still collapse to ~0
                    when the fixed columns alone already fill the container —
                    its header text then overflows into the next column instead
                    of the table just growing wider and scrolling. */}
                {columns.map(c => <col key={c.key} style={c.width === 'auto' ? { minWidth: '12rem' } : { width: c.width }} />)}
                <col style={{ width: '2.25rem' }} />
              </colgroup>
              {/* A real spreadsheet grid: every header and data cell gets its own
                 border, so border-collapse draws one continuous gridline between
                 them both across and down — columns read as columns, not just
                 rows read as rows. */}
              <thead className="bg-slate-200 sticky top-0 z-20 shadow-[0_2px_0_#94a3b8] dark:bg-navy-900 dark:shadow-[0_2px_0_#3e4f8f]">
                <tr>
                  <th className="border border-slate-300 px-2 py-1.5 dark:border-navy-700">
                    <input type="checkbox" aria-label="Select everything shown" checked={allVisibleSelected} onChange={e => setMany(visible, e.target.checked)} />
                  </th>
                  {columns.map(c => (
                    <th key={c.key} className={`border border-slate-300 px-2 py-1.5 overflow-hidden whitespace-nowrap text-ellipsis text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-navy-700 dark:text-slate-300 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {c.sortKey ? (
                        <button className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-800 dark:hover:text-slate-100 ${sort.key === c.sortKey ? 'text-navy-700 dark:text-slate-100' : ''}`} onClick={() => sortBy(c.sortKey)}>
                          {c.header}
                          {sort.key === c.sortKey && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </button>
                      ) : c.header}
                    </th>
                  ))}
                  <th className="border border-slate-300 dark:border-navy-700" />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ group, rows }) => {
                  const isCollapsed = collapsed.has(group.key)
                  const allIn = group.rows.every(r => selected.has(r.id))
                  // See groupHeader's own comment: a single-line Kas Bon has
                  // nothing left to summarize, so its total is left out below
                  // — but every group header row is otherwise the same size
                  // and weight, solo or not, so Kas Bons don't look randomly
                  // bigger or smaller than each other while scanning down.
                  const solo = filters.groupBy === 'kasbon' && group.rows.length === 1
                  // Every row's cells are individually bordered (the grid itself
                  // never breaks), with one extra: a bolder bottom edge marking
                  // "a new Kas Bon starts here" the way a spreadsheet's own
                  // subtotal-row rule would.
                  const cellBorder = 'border border-slate-200 border-b-2 border-b-slate-300 dark:border-navy-800 dark:border-b-navy-600'
                  const monthDivider = monthDividers.get(group.key)
                  return (
                    <React.Fragment key={group.key || 'all'}>
                      {monthDivider && (
                        <tr>
                          <td colSpan={columns.length + 2} className="border border-slate-200 border-b-2 border-b-gold-500 dark:border-navy-800 dark:border-b-gold-500/40 bg-gold-400/15 px-3 py-3 text-lg text-center font-bold uppercase tracking-wide text-navy-900 dark:bg-gold-500/10 dark:text-gold-300">
                            {monthDivider}
                          </td>
                        </tr>
                      )}
                      {filters.groupBy !== 'none' && (
                        <tr className="bg-slate-100 group/gh dark:bg-navy-900">
                          <td className={`${cellBorder} px-2 py-3`}>
                            <input
                              type="checkbox" aria-label="Select this group" checked={allIn} onChange={e => setMany(group.rows, e.target.checked)}
                              className={`block transition-opacity ${allIn ? '' : 'opacity-0 group-hover/gh:opacity-100 focus:opacity-100'}`}
                            />
                          </td>
                          {/* Split across real column boundaries (not one wide flex cell)
                             so the group sum lines up under Total/Price instead of
                             floating to the row's far right, where it used to sit
                             right under the Order column and read as an order figure. */}
                          <td colSpan={sumColIndex} className={`${cellBorder} px-2 py-3`}>
                            <div className="flex items-center gap-2.5 text-sm min-w-0">
                              <button onClick={() => setCollapsed(c => { const n = new Set(c); if (n.has(group.key)) n.delete(group.key); else n.add(group.key); return n })} className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
                                <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                              </button>
                              {groupHeader(group.key, group.rows)}
                            </div>
                          </td>
                          {/* Quiet and small on purpose: a summary aside, not a second
                             figure competing with the bold Total every data row already
                             carries — that's the one number this table trains the eye to
                             look for. A solo line's own Total cell, right below, already
                             shows this number, so it's left out of its header entirely. */}
                          <td className={`${cellBorder} px-2 py-3 text-right font-mono tabular-nums whitespace-nowrap text-xs text-slate-400 dark:text-slate-500`}>
                            {!solo && formatRp(groupSum(group.rows))}
                          </td>
                          {sumColIndex < columns.length - 1 && (
                            <td colSpan={columns.length - sumColIndex - 1} className={cellBorder} />
                          )}
                          <td className={`${cellBorder} px-1 text-center`}>
                            {byKasBon && (
                              <span className="inline-flex items-center gap-1.5">
                                <button className="opacity-0 group-hover/gh:opacity-100 text-slate-500 hover:text-navy-700 dark:text-slate-400" title={`Add lines to ${group.key}`} onClick={() => setForm({ headerId: group.key })}>
                                  <Plus size={14} />
                                </button>
                                <button className="opacity-0 group-hover/gh:opacity-100 text-slate-500 hover:text-navy-700 dark:text-slate-400" title={`Print ${group.key}`} onClick={() => navigate(`/finance/kasbon/print?id=${encodeURIComponent(group.key)}`)}>
                                  <Printer size={14} />
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                      {/* Plain white + gridlines, no zebra striping — a spreadsheet's
                         own default look; the grid lines alone carry row/column
                         separation, the way they do in an actual sheet. */}
                      {rows.map(r => (
                        <tr key={r.id} className={`group ${selected.has(r.id) ? 'bg-navy-50' : 'bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5'}`}>
                          <td className="border border-slate-200 px-2 py-2 dark:border-navy-800">
                            <input
                              type="checkbox" aria-label="Select line" checked={selected.has(r.id)} onChange={() => undefined} onClick={e => toggle(r.id, e.shiftKey)}
                              className={`block transition-opacity ${selected.has(r.id) ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                            />
                          </td>
                          {columns.map((c, ci) => (
                            <td key={c.key} className={`border border-slate-200 px-1 py-0.5 truncate dark:border-navy-800 ${c.align === 'right' ? 'text-right' : ''}`}>
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
                                <div ref={cellRef(`${r.id}:${ci}`)} tabIndex={0} className="px-2.5 py-1.5 min-h-[2rem] flex items-center focus:outline-none focus:bg-navy-50/50 rounded-sm"
                                  onKeyDown={e => {
                                    const d = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[e.key]
                                    if (d) { e.preventDefault(); moveFocus(r.id, ci, d[0], d[1]) }
                                  }}>
                                  {c.render ? c.render(r) : c.value(r)}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="border border-slate-200 px-1 text-center dark:border-navy-800">
                            <span className="inline-flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                              {/* The desktop table's only route to the full
                                 line editor — per-cell edits cover most
                                 changes, but re-picking a catalogue colour
                                 needs the picker LineEditor carries. */}
                              <button onClick={() => setEditing(r)} className="text-slate-300 hover:text-navy-700 dark:text-navy-700 dark:hover:text-slate-200" title="Edit line">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setConfirmDeleteRow(r)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title="Delete line">
                                <Trash2 size={14} />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {flatShown.length < visible.length && (
              <div className="p-3 text-center border-t border-slate-200 dark:border-navy-700">
                <button className="btn-secondary btn-sm" onClick={() => setLimit(l => l + PAGE)}>Show more ({visible.length - flatShown.length} left)</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 px-4 py-2 border-t-2 border-slate-300 bg-slate-100 text-xs text-slate-500 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-400">
            <span>Click a cell to edit · arrows move · shift-click selects a range · Ctrl+V pastes rows from Excel · Ctrl+Z undoes</span>
            <span className="ml-auto font-mono text-sm text-navy-900 font-semibold tabular-nums dark:text-slate-50">{formatRp(total)}</span>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 pointer-events-none dock:left-[240px]" data-bulk-bar>
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-navy-900 text-white shadow-2xl px-3 py-2 max-w-full">
            <span className="px-2 text-sm"><span className="font-semibold">{selected.size}</span> selected · <span className="font-mono">{formatRp(selectedTotal)}</span></span>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('move')}><ArrowRightLeft size={13} /> Move</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog(kind === 'production' ? 'supplier_id' : 'category')}><Tag size={13} /> {kind === 'production' ? 'Supplier' : 'Category'}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('order_id')}><Link2 size={13} /> Order</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" disabled={batch.isPending} onClick={() => duplicateRows(selectedRows)}><Copy size={13} /> Copy</button>
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
      {dialog === 'move' && <MoveDialog rows={selectedRows} headers={headers} saving={batch.isPending} onApply={(b, l) => apply(b, l)} onClose={() => setDialog(null)} />}
      {(dialog === 'supplier_id' || dialog === 'category' || dialog === 'order_id') && (
        <SetFieldDialog rows={selectedRows} field={dialog} suppliers={suppliers} orders={orders} categories={categories} saving={batch.isPending} onApply={(b, l) => apply(b, l)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          message={`Delete ${selected.size} line${selected.size === 1 ? '' : 's'} (${formatRp(selectedTotal)})? You can undo this right after.`}
          onConfirm={() => removeRows(selectedRows)}
          onCancel={() => setDialog(null)}
        />
      )}
      {confirmDeleteRow && (
        <ConfirmDialog
          message={`Delete "${confirmDeleteRow.name || confirmDeleteRow.category}" (${formatRp(confirmDeleteRow.total)})? You can undo this right after.`}
          onConfirm={() => { removeRows([confirmDeleteRow]); setConfirmDeleteRow(null); setEditing(null) }}
          onCancel={() => setConfirmDeleteRow(null)}
        />
      )}
      {editing && (
        <LineEditor row={editing} suppliers={suppliers} orders={orders} categories={categories} saving={batch.isPending}
          onApply={(b, l) => apply(b, l, () => setEditing(null))}
          onDelete={() => setConfirmDeleteRow(editing)}
          onClose={() => setEditing(null)} />
      )}
      {colorPickFor && (
        <MaterialColorPickerModal
          material={colorPickFor.material}
          colors={colorPickFor.colors}
          selectedCode={colorPickFor.selectedCode}
          onPick={code => {
            editRow(colorPickFor.row, 'name', `${materialLabel(colorPickFor.material)} - ${code}`)
            setColorPickFor(null)
          }}
          onClose={() => setColorPickFor(null)}
        />
      )}
    </div>
  )
}
