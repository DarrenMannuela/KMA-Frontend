import { changeLabel } from '@/utils/changeLabel'
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Trans, useTranslation } from 'react-i18next'
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, FileUp, Link2, Plus, Printer, Rows2, Rows3, Search, Trash2, X,
  ArrowRightLeft, Tag, Copy, CheckSquare, BookOpen, Images, SlidersHorizontal,
} from 'lucide-react'
import { EditableCell, TableSkeleton, formatRp } from '@/components/ui'
import { ErrorState } from '@/components/ui/Page'
import { ScrollX } from '@/components/ui/ScrollX'
import { ConfirmDialog } from '@/components/ui'
import {
  productionHooks, operationHooks, supplierHooks, orderHooks, useFinanceHeaders, useFinanceBatch, undoLast, useBudgets,
  useSupplierCatalogues, supplierDesignHooks,
} from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SI_UNITS } from '@/utils/Units'
import { formatDateShort, shortMonthLabel as monthShort, monthLabel } from '@/utils/MonthUtils'
import { parseDelimited } from '@/utils/tableText'
import { CATEGORY_COLORS } from '@/constants/supplierCategories'
import { colorFromText, catalogueForSupplier, materialFromText, materialLabel, colorCodeFromText } from '@/data/materialCatalogue'
import type { CatalogueMaterial, CatalogueColor, SupplierCatalogue } from '@/data/materialCatalogue'
import { MaterialColorPickerModal, CatalogueMaterialPickerModal } from './MaterialColorPicker'
import { DesignPickerModal, DesignThumb } from './DesignPicker'
import { designFromText, designLabel, designsFor } from '@/data/designs'
import type { FinanceBatch, SupplierDesign } from '@/types'
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
import { useCreateOnArrival } from '@/hooks/useCreateOnArrival'
import { useRovingCells } from '@/hooks/useRovingCells'

type GroupBy = 'kasbon' | 'group' | 'order' | 'none'
type SortKey = 'header_id' | 'date' | 'name' | 'group' | 'qty' | 'price' | 'total' | 'order_id'

interface LedgerCol {
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

// Plain numbers in the sheet's cells: the column header says "(Rp)" once,
// the way their Excel sheet does, instead of every cell repeating it.
const amount = (v: number) => v.toLocaleString('id-ID')
const money = (v: number) => <span className="font-mono tabular-nums">{amount(v)}</span>

/** Everything a sheet line shows, so an unchanged line can be recognised. */
const rowSignature = (r: LedgerRow) =>
  [r.header_id, r.date, r.description, r.name, r.supplier_id, r.category, r.qty, r.unit, r.price, r.total, r.order_id ?? ''].join('\u0000')

interface LineActions {
  toggle: (id: number, shift: boolean) => void
  edit: (r: LedgerRow, field: EditField, value: unknown) => void
  move: (rowId: number, col: number, dRow: number, dCol: number) => void
  confirmDelete: (r: LedgerRow) => void
  cellRef: (key: string) => (el: HTMLElement | null) => void
}

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

/** One sheet line. Memoised: a save, a keystroke in the search box or a
 *  selection elsewhere re-renders only the lines whose data, columns or
 *  selection actually changed, not every line of the month. */
const LedgerLine = React.memo(function LedgerLine({ r, columns, isSelected, actions }: {
  r: LedgerRow
  columns: LedgerCol[]
  isSelected: boolean
  actions: LineActions
}) {
  const { t } = useTranslation()
  return (
    <tr className={`group ${isSelected ? 'bg-navy-50' : 'bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5'}`}>
      <td className="border border-slate-200 px-2 py-2 dark:border-navy-800">
        <input
          type="checkbox" tabIndex={-1} aria-label={t('ledger.selectLine')} checked={isSelected} onChange={() => undefined} onClick={e => actions.toggle(r.id, e.shiftKey)}
          className={`block transition-opacity ${isSelected ? '' : 'can-hover:opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
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
              onSave={v => actions.edit(r, c.field!, v)}
              cellRef={actions.cellRef(`${r.id}:${ci}`)}
              tabIndex={-1}
              onNavigate={(dr, dc) => actions.move(r.id, ci, dr, dc)}
            />
          ) : (
            <div ref={actions.cellRef(`${r.id}:${ci}`)} tabIndex={-1} className="px-2.5 py-1.5 min-h-[2rem] flex items-center focus:outline-none focus:bg-navy-50/50 rounded-sm"
              onKeyDown={e => {
                const d = ARROWS[e.key]
                if (d) { e.preventDefault(); actions.move(r.id, ci, d[0], d[1]) }
              }}>
              {c.render ? c.render(r) : c.value(r)}
            </div>
          )}
        </td>
      ))}
      <td className="border border-slate-200 px-1 text-center dark:border-navy-800">
        {/* Every field in this row, including the Kas Bon's own date and
           description above, is a direct click away in its own cell; delete
           is the one action left with no cell of its own. */}
        <button onClick={() => actions.confirmDelete(r)} tabIndex={-1} className="text-slate-400 hover:text-red-500 can-hover:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 dark:text-slate-500" title={t('ledger.deleteLine')} aria-label={t('ledger.deleteLine')}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
})
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
const DENSITY_KEY = 'kma.ledger.density'

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
export function Ledger({ kind, initial, title }: {
  kind: Kind
  initial?: Partial<LedgerFilters>
  title: string
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const production = productionHooks.useList()
  const operations = operationHooks.useList()
  const source = kind === 'production' ? production : operations
  const { data: suppliers = [] } = supplierHooks.useList()
  const { data: orders = [] } = orderHooks.useList()
  // SAI's static catalogue plus every database-backed supplier's own —
  // see useSupplierCatalogues — so the swatch/picker below works the same
  // way regardless of which supplier a line is on.
  const catalogues = useSupplierCatalogues()
  // Bordir/sablon suppliers' designs, for the same kind of picker.
  const { data: designs = [] } = supplierDesignHooks.useList()
  const { data: headers = [] } = useFinanceHeaders()
  const { data: budgets = [] } = useBudgets()
  const batch = useFinanceBatch()

  const [limit, setLimit] = useState(PAGE)
  const [filters, setFilters] = useState<LedgerFilters>(() => {
    const saved = loadPrefs(kind)
    return {
      q: '', group: '', order: 'any',
      groupBy: saved.groupBy ?? 'kasbon',
      period: { ...currentPeriod(saved.period?.mode ?? 'month') },
      ...initial,
    }
  })
  const setFilter = <K extends keyof LedgerFilters>(k: K, v: LedgerFilters[K]) => { setFilters(f => ({ ...f, [k]: v })); setLimit(PAGE) }
  useEffect(() => {
    try {
      localStorage.setItem(prefKey(kind), JSON.stringify({ groupBy: filters.groupBy, period: { mode: filters.period.mode } }))
    } catch { /* private mode */ }
  }, [kind, filters.groupBy, filters.period.mode])

  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<{ headerId?: string; lines?: DraftLine[] } | null>(null)
  useCreateOnArrival(() => setForm({}))
  const [importGrid, setImportGrid] = useState<Grid | null | undefined>(undefined)
  const [dialog, setDialog] = useState<null | 'move' | 'supplier_id' | 'category' | 'order_id' | 'delete'>(null)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  // The desktop table's swatch/palette icon in the Bahan column opens the
  // colour grid directly on click, rather than needing the row's own name
  // cell (plain text editing) or the separate Edit-line dialog first —
  // clicking the swatch itself didn't do anything before this.
  const [colorPickFor, setColorPickFor] = useState<{ row: LedgerRow; material: CatalogueMaterial; colors: CatalogueColor[]; selectedCode?: string; price?: number } | null>(null)
  // A line whose Bahan isn't in its supplier's catalogue (typed by hand, or
  // its supplier changed): choose the material first, then its colour.
  const [materialPickFor, setMaterialPickFor] = useState<{ row: LedgerRow; catalogue: SupplierCatalogue; supplierName: string } | null>(null)
  // A line from a bordir/sablon supplier: which of its designs it is.
  const [designPickFor, setDesignPickFor] = useState<{ row: LedgerRow; designs: SupplierDesign[]; supplierName: string; selectedId?: number } | null>(null)
  // A single line's delete also confirms first — unlike the bulk one above,
  // it has no selecting-then-clicking-Delete step of its own to catch a
  // mis-click, just the one small icon.
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<LedgerRow | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  // Row height for the desktop sheet, remembered in this browser: Compact
  // (~30px lines) fits a month on screen, Comfortable is easier to aim at.
  const [density, setDensityState] = useState<'comfortable' | 'compact'>(() => {
    try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable' } catch { return 'comfortable' }
  })
  const setDensity = (d: 'comfortable' | 'compact') => {
    setDensityState(d)
    try { localStorage.setItem(DENSITY_KEY, d) } catch { /* private mode: just not remembered */ }
  }
  const filtersActive = !!filters.q || !!filters.group || filters.order !== 'any'
  // Phone: the three dropdowns sit behind one Filter button (so the sheet's
  // first rows are on the first screen); it says how many are set.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const dropdownsSet = (filters.group ? 1 : 0) + (filters.order !== 'any' ? 1 : 0) + (filters.groupBy !== 'kasbon' ? 1 : 0)
  const clearFilters = () => { setFilters(f => ({ ...f, q: '', group: '', order: 'any' })); setLimit(PAGE) }
  const searchRef = useRef<HTMLInputElement>(null)
  const lastClicked = useRef<number | null>(null)

  // A refetch rebuilds every line object (items are joined to their Kas Bon
  // header), so a line whose data hasn't changed keeps its previous object:
  // the memoised LedgerLine then skips it, and a save re-renders only what
  // actually changed instead of the whole month.
  const rowCache = useRef(new Map<number, { sig: string; row: LedgerRow }>())
  const allRows = useMemo<LedgerRow[]>(() => {
    const built = kind === 'production' ? production.data.map(fromProduction) : operations.data.map(fromOperation)
    const next = new Map<number, { sig: string; row: LedgerRow }>()
    const out = built.map(row => {
      const sig = rowSignature(row)
      const hit = rowCache.current.get(row.id)
      const keep = hit && hit.sig === sig ? hit.row : row
      next.set(row.id, { sig, row: keep })
      return keep
    })
    rowCache.current = next
    return out
  }, [kind, production.data, operations.data])
  const otherCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of kind === 'production' ? operations.data : production.data) counts.set(r.header_id, (counts.get(r.header_id) ?? 0) + 1)
    return counts
  }, [kind, production.data, operations.data])

  const categories = useMemo(
    () => [...new Set(operations.data.map(r => r.category).filter(Boolean))].sort(),
    [operations.data],
  )
  const groupName = useCallback((r: LedgerRow) => (kind === 'production' ? supplierLabel(suppliers, r.supplier_id) : r.category || t('ledger.uncategorized')), [kind, suppliers, t])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const texts = useMemo(() => new Map(allRows.map(r => [r.id, searchText(r, suppliers, orders)])), [allRows, suppliers, orders])
  const groupOf = useCallback((r: LedgerRow) => (kind === 'production' ? String(r.supplier_id) : r.category), [kind])
  // The search box shows each keystroke at once; filtering the sheet uses the
  // deferred copy, so typing never waits on a year of lines being re-filtered.
  const q = useDeferredValue(filters.q)
  const passesBase = useCallback((r: LedgerRow, period: Period) => {
    if (!inPeriod(r.date, period)) return false
    if (filters.order === 'none' && r.order_id) return false
    if (filters.order === 'linked' && !r.order_id) return false
    if (!['any', 'none', 'linked'].includes(filters.order) && r.order_id !== filters.order) return false
    return !q || matchesSearch(texts.get(r.id) ?? '', q)
  }, [filters.order, q, texts])
  const passes = useCallback((r: LedgerRow, period: Period) =>
    passesBase(r, period) && (!filters.group || groupOf(r) === filters.group), [passesBase, filters.group, groupOf])

  // A search looks through every month; the period still applies otherwise.
  const searching = !!q.trim() && filters.period.mode === 'month'
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
    for (const r of sorted) {
      const k = keyOf(r)
      const list = map.get(k)
      if (list) list.push(r)
      else map.set(k, [r])
    }
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

  // The budget for what's shown, when there is one for exactly that.
  const budget = useMemo(() => {
    if (filters.period.mode !== 'month' || q || filters.order !== 'any') return null
    const scopeBudgets = budgets.filter(b => b.scope === kind)
    if (kind === 'operation') return scopeBudgets.find(b => b.category === (filters.group || ''))?.amount ?? null
    if (filters.group) return null
    return scopeBudgets.find(b => b.category === '')?.amount ?? null
  }, [budgets, kind, filters, q])

  // ── Changes ────────────────────────────────────────────────────────────────
  const apply = (b: FinanceBatch, label: string, after?: () => void) =>
    batch.mutate({ batch: b, label }, { onSuccess: () => { setDialog(null); after?.() } })

  const editRow = (r: LedgerRow, field: EditField, value: unknown) => {
    if (field === 'order_id') {
      const v = String(value ?? '').trim().toUpperCase()
      if (v && !orders.some(o => o.id === v)) return void toast.error(t('ledger.noOrder', { id: v }))
      value = v || null
    }
    if (field === 'date') {
      const d = String(value ?? '').trim()
      if (!d || Number.isNaN(new Date(d).getTime())) return void toast.error(t('orders.dateRequired'))
      value = d
    }
    if (field === 'header_id') {
      const id = String(value).trim().toUpperCase()
      if (!id || id === r.header_id) return
      const b = editBatch([r], 'header_id', id)
      if (!headers.some(h => h.id === id)) b.headers = [{ id, date: r.date, description: r.description }]
      return apply(b, t('ledger.movedLineTo', { name: r.name || r.category, id }))
    }
    const label = field === 'date' ? t('ledger.changedDateOf', { id: r.header_id })
      : field === 'description' ? t('ledger.changedDescriptionOf', { id: r.header_id })
      : t('ledger.changedLine', { name: `${r.name || r.category}` })
    apply(editBatch([r], field, value), label)
  }

  const removeRows = (rows: LedgerRow[]) =>
    apply(deleteBatch(rows), rows.length === 1 ? t('ledger.deletedLine', { name: rows[0].name || rows[0].category }) : t('ledger.deletedLines', { n: rows.length }), () => setSelected(new Set()))

  const duplicateRows = (rows: LedgerRow[]) => {
    const b: FinanceBatch = { production_create: [], operation_create: [] }
    for (const r of rows) {
      if (r.kind === 'production') b.production_create!.push({ header_id: r.header_id, material_name: r.name, supplier_id: r.supplier_id, amount: r.qty, si_unit: r.unit, price: r.price, order_id: r.order_id })
      else b.operation_create!.push({ header_id: r.header_id, category: r.category, description: r.name, price: r.price, order_id: r.order_id })
    }
    apply(b, t('ledger.copiedLines', { count: rows.length }))
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
      // A focused cell already consumed this key (typing into it starts
      // editing with that keystroke) — "n" must not also open New Kas Bon.
      if (e.defaultPrevented) return
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
  const onGridFocus = useRovingCells(cellRefs)
  const onGridKey = (e: React.KeyboardEvent) => {
    if (e.key !== ' ' || !e.shiftKey || e.defaultPrevented) return
    for (const [key, el] of cellRefs.current) {
      if (el !== e.target) continue
      e.preventDefault()
      toggle(Number(key.split(':')[0]), false)
      return
    }
  }
  // The same callback for a cell on every render: a fresh one each time made
  // React detach and re-attach every cell's ref (thousands) on each render.
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const cellRef = (key: string) => {
    let cb = refCallbacks.current.get(key)
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) cellRefs.current.set(key, el)
        else cellRefs.current.delete(key)
      }
      refCallbacks.current.set(key, cb)
    }
    return cb
  }

  // ── Columns ────────────────────────────────────────────────────────────────
  const supplierOptions = useMemo(() => suppliers.map(s => ({ value: s.id, label: supplierWithCategory(s) })), [suppliers])
  // Keyed on the unit names themselves, so a save that doesn't add a new unit
  // keeps the same options (and the same columns) as before.
  const unitKey = [...new Set([...SI_UNITS, ...allRows.map(r => r.unit).filter(Boolean)])].join('\u0000')
  const unitOptions = useMemo(() => unitKey.split('\u0000').map(u => ({ value: u, label: u })), [unitKey])
  const orderSuggestions = useMemo(() => orders.slice(-300).map(o => o.id).reverse(), [orders])
  const headerSuggestions = useMemo(() => headers.slice(-300).map(h => h.id).reverse(), [headers])
  const byKasBon = filters.groupBy === 'kasbon'

  const columns = useMemo<LedgerCol[]>(() => [
    ...(!byKasBon ? [
      { key: 'header_id', header: t('ledger.columns.kasBon'), width: '6.5rem', sortKey: 'header_id' as SortKey, field: 'header_id' as EditField, type: 'text' as const, suggestions: headerSuggestions, value: (r: LedgerRow) => r.header_id, render: (r: LedgerRow) => <span className="font-mono text-xs">{r.header_id}</span> },
      { key: 'date', header: t('common.date'), width: '6.5rem', sortKey: 'date' as SortKey, field: 'date' as EditField, type: 'date' as const, value: (r: LedgerRow) => r.date.slice(0, 10), render: (r: LedgerRow) => <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{formatDateShort(r.date)}</span> },
      { key: 'description', header: t('ledger.columns.description'), width: '11rem', field: 'description' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.description, render: (r: LedgerRow) => <span className="text-slate-600 dark:text-slate-300">{r.description}</span> },
    ] : []),
    ...(kind === 'production' ? [
      { key: 'name', header: t('ledger.columns.bahan'), width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name,
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
          const catalogue = catalogueForSupplier(supplierLabel(suppliers, r.supplier_id), catalogues)
          const catMatch = catalogue ? materialFromText(catalogue, r.name) : undefined
          const catColors = catalogue && catMatch ? catalogue.colorsFor(catMatch) : []
          const catCode = catMatch ? colorCodeFromText(catMatch, r.name) : undefined
          const c = catCode ? catColors.find(x => x.code === catCode) : undefined
          // The colour is its own little picker chip (dot, code, caret) at the
          // cell's right edge, so it reads as "this can be changed" on touch
          // screens too, where a hover hint would never show. The name drops
          // the " - CODE" the chip already shows; the saved name is unchanged.
          const shownName = catMatch && catCode ? materialLabel(catMatch) : r.name
          const lineDesigns = designsFor(designs, r.supplier_id)
          const design = lineDesigns.length ? designFromText(lineDesigns, r.supplier_id, r.name) : undefined
          return (
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-slate-800 truncate dark:text-slate-200" title={r.name}>{shownName}</span>
              {lineDesigns.length > 0 && !catMatch && (
                // A bordir/sablon supplier's design: its photo once picked,
                // a dashed "Design" chip until then. Either opens the gallery.
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setDesignPickFor({ row: r, designs: lineDesigns, supplierName: supplierLabel(suppliers, r.supplier_id) ?? '', selectedId: design?.id }) }}
                  className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full bg-white py-0.5 text-[11px] text-navy-700 hover:border-navy-500 hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-400 dark:bg-navy-950 dark:text-slate-200 dark:hover:bg-navy-800 ${design ? 'border border-slate-300 pl-0.5 pr-1.5 shadow-sm dark:border-navy-600' : 'border border-dashed border-navy-300 pl-1.5 pr-1.5 dark:border-navy-500'}`}
                  title={design ? t('designs.chipChange', { design: designLabel(design) }) : t('designs.chipPick', { supplier: supplierLabel(suppliers, r.supplier_id) ?? '' })}
                  aria-label={design ? t('designs.chipChange', { design: designLabel(design) }) : t('designs.chipPick', { supplier: supplierLabel(suppliers, r.supplier_id) ?? '' })}
                >
                  {design ? <DesignThumb design={design} className="w-5 h-5 rounded-full" /> : <Images size={11} aria-hidden />}
                  <span>{t('designs.chip')}</span>
                  <ChevronDown size={11} className="text-slate-400 dark:text-slate-500" />
                </button>
              )}
              {catalogue && !catMatch && catalogue.materials.length > 0 && lineDesigns.length === 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setMaterialPickFor({ row: r, catalogue, supplierName: supplierLabel(suppliers, r.supplier_id) ?? '' }) }}
                  className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-navy-300 bg-white pl-1.5 pr-1.5 py-0.5 text-[11px] text-navy-700 hover:border-navy-500 hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-400 dark:border-navy-500 dark:bg-navy-950 dark:text-slate-200 dark:hover:bg-navy-800"
                  title={t('ledger.catalogue.chipTitle', { supplier: supplierLabel(suppliers, r.supplier_id) ?? '' })}
                  aria-label={t('ledger.catalogue.chipTitle', { supplier: supplierLabel(suppliers, r.supplier_id) ?? '' })}
                >
                  <BookOpen size={11} aria-hidden />
                  <span>{t('ledger.catalogue.chip')}</span>
                  <ChevronDown size={11} className="text-slate-400 dark:text-slate-500" />
                </button>
              )}
              {catMatch && catColors.length > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setColorPickFor({ row: r, material: catMatch, colors: catColors, selectedCode: catCode }) }}
                  className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white pl-1 pr-1.5 py-0.5 text-[11px] text-slate-700 shadow-sm hover:border-navy-400 hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-400 dark:border-navy-600 dark:bg-navy-950 dark:text-slate-200 dark:hover:border-navy-400 dark:hover:bg-navy-800"
                  title={c ? t('ledger.colourClickToChange', { colour: `${c.code}${c.category ? ` · ${c.category}` : ''}` }) : t('ledger.pickColour')}
                  aria-label={c ? t('ledger.colourClickToChange', { colour: c.code }) : t('ledger.pickColour')}
                >
                  {c
                    ? <span className="block w-3 h-3 rounded-full ring-1 ring-black/25 dark:ring-white/30" style={{ background: c.hex }} />
                    : catCode
                      ? <span className="block w-3 h-3 rounded-full border border-dashed border-slate-400 dark:border-slate-500" />
                      : <Plus size={11} className="text-slate-500 dark:text-slate-400" />}
                  <span className={`max-w-[7rem] truncate ${catCode ? 'font-mono' : ''}`}>{catCode ?? t('ledger.colourChip')}</span>
                  <ChevronDown size={11} className="text-slate-400 dark:text-slate-500" />
                </button>
              )}
            </span>
          )
        } },
      { key: 'supplier', header: t('ledger.columns.supplier'), width: '14rem', sortKey: 'group' as SortKey, field: 'supplier_id' as EditField, type: 'select' as const, options: supplierOptions, value: (r: LedgerRow) => r.supplier_id,
        render: (r: LedgerRow) => {
          const s = suppliers.find(x => x.id === r.supplier_id)
          return <span className="flex items-center gap-1.5 min-w-0">{s && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[s.supplier_category] }} />}<span className="truncate" title={s?.supplier_name}>{s?.supplier_name ?? t('ledger.noSupplier')}</span></span>
        } },
      { key: 'qty', header: t('ledger.columns.qty'), width: '4.5rem', sortKey: 'qty' as SortKey, align: 'right' as const, field: 'qty' as EditField, type: 'number' as const, value: (r: LedgerRow) => r.qty, render: (r: LedgerRow) => <span className="tabular-nums">{r.qty.toLocaleString('id-ID')}</span> },
      { key: 'unit', header: t('ledger.columns.unit'), width: '5rem', field: 'unit' as EditField, type: 'select' as const, options: unitOptions, value: (r: LedgerRow) => r.unit },
    ] : [
      { key: 'category', header: t('ledger.columns.category'), width: '9rem', sortKey: 'group' as SortKey, field: 'category' as EditField, type: 'text' as const, suggestions: categories, value: (r: LedgerRow) => r.category },
      { key: 'name', header: t('ledger.columns.item'), width: 'auto', sortKey: 'name' as SortKey, field: 'name' as EditField, type: 'text' as const, value: (r: LedgerRow) => r.name, render: (r: LedgerRow) => <span className="font-medium text-slate-800 dark:text-slate-200">{r.name}</span> },
    ]),
    { key: 'price', header: `${t('ledger.columns.price')} (Rp)`, width: '7.5rem', sortKey: 'price', align: 'right', field: 'price', type: 'number', value: r => r.price, render: r => money(r.price) },
    ...(kind === 'production' ? [{ key: 'total', header: `${t('ledger.columns.total')} (Rp)`, width: '8rem', sortKey: 'total' as SortKey, align: 'right' as const, value: (r: LedgerRow) => r.total, render: (r: LedgerRow) => <span className="font-mono tabular-nums font-semibold">{amount(r.total)}</span> }] : []),
    { key: 'order', header: t('ledger.columns.order'), width: '8rem', sortKey: 'order_id', field: 'order_id', type: 'text', suggestions: orderSuggestions, value: r => r.order_id ?? '',
      render: r => (r.order_id ? <span className="font-mono text-xs text-navy-700 dark:text-slate-200" title={orderLabel(orders, r.order_id)}>{r.order_id}</span> : <span className="text-slate-300 dark:text-navy-700">—</span>) },
  ], [byKasBon, kind, t, headerSuggestions, suppliers, catalogues, designs, supplierOptions, unitOptions, categories, orderSuggestions, orders])
  // The checkbox and actions columns (2.25rem each) plus every fixed-width column.
  const fixedRem = 4.5 + columns.reduce((n, c) => n + (c.width.endsWith('rem') ? parseFloat(c.width) : 0), 0)

  const moveFocus = (rowId: number, col: number, dRow: number, dCol: number) => {
    const i = flatShown.findIndex(r => r.id === rowId)
    const row = flatShown[Math.min(Math.max(i + dRow, 0), flatShown.length - 1)]
    const c = Math.min(Math.max(col + dCol, 0), columns.length - 1)
    if (row) cellRefs.current.get(`${row.id}:${c}`)?.focus()
  }

  // Stable handlers for the memoised lines: the same object every render,
  // always calling the latest closures (which see the current rows/filters).
  const lineActionsRef = useRef<LineActions | null>(null)
  lineActionsRef.current = { toggle, edit: editRow, move: moveFocus, confirmDelete: setConfirmDeleteRow, cellRef }
  const lineActions = useMemo<LineActions>(() => ({
    toggle: (id, shift) => lineActionsRef.current!.toggle(id, shift),
    edit: (r, field, value) => lineActionsRef.current!.edit(r, field, value),
    move: (rowId, col, dRow, dCol) => lineActionsRef.current!.move(rowId, col, dRow, dCol),
    confirmDelete: r => lineActionsRef.current!.confirmDelete(r),
    cellRef: key => lineActionsRef.current!.cellRef(key),
  }), [])

  const sortBy = (key?: SortKey) => key && setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'price' ? 'desc' : 'asc' }))

  // ── Rendering ──────────────────────────────────────────────────────────────
  if (source.isLoading) return <div className="p-4 md:p-6"><div className="card"><TableSkeleton rows={12} columns={7} label={kind === 'production' ? t('ledger.loadingProduction') : t('ledger.loadingOperation')} /></div></div>
  if (source.isError) return <div className="p-4 md:p-6"><div className="card"><ErrorState what={kind === 'production' ? t('ledger.errorProduction') : t('ledger.errorOperation')} onRetry={() => source.refetch()} /></div></div>

  // The group's running sum: a separate value from the label content below,
  // since the desktop table now places it in its own cell aligned under a
  // real column (Total, or Price when there's no Total column) instead of
  // floating it to the row's far right — which used to land it right under
  // the Order column header and read as if it were an order-related figure.
  const groupSum = (rows: LedgerRow[]) => rows.reduce((n, r) => n + r.total, 0)
  // Grouped by Kas Bon, a line's own row never shows the Kas Bon's date or
  // description (they're not per-line fields) — only this header row does.
  // That used to make them the one thing on this whole sheet you couldn't
  // click to edit, so fixing either meant detouring through the Pencil
  // dialog even though every other field was already a click away. `editable`
  // (desktop only — the mobile card list taps this row to collapse/expand
  // instead, so it can't also host an edit control) swaps the two for the
  // same EditableCell the rest of the table uses.
  const editHeader = (key: string, first: LedgerRow, patch: { date?: string; description?: string }) =>
    apply(
      // production_update/operation_update as explicit empty arrays, not
      // omitted — matching the exact shape LineEditor's own header-only save
      // already sent successfully (it always builds both keys, even when
      // only date/description changed), rather than a header_update-only
      // batch the backend may never have been exercised with.
      {
        production_update: [],
        operation_update: [],
        header_update: [{ id: key, date: patch.date ?? first.date.slice(0, 10), description: (patch.description ?? first.description ?? '').toUpperCase() }],
      },
      patch.date ? t('ledger.changedDateOf', { id: key }) : t('ledger.changedDescriptionOf', { id: key }),
    )
  const groupHeader = (key: string, rows: LedgerRow[], editable = false) => {
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
          <span className="shrink-0 font-mono text-sm font-bold px-2 py-0.5 rounded-md bg-white border border-slate-300 text-navy-900 shadow-sm dark:bg-navy-950 dark:border-navy-600 dark:text-slate-50">{key}</span>
          {editable ? (
            <EditableCell
              value={first.description}
              placeholder={t('ledger.noDescription')}
              uppercase
              format={v => <span className="text-sm font-medium text-slate-700 truncate dark:text-slate-200">{v || t('ledger.noDescription')}</span>}
              onSave={v => editHeader(key, first, { description: String(v) })}
            />
          ) : (
            <span className="text-sm font-medium text-slate-700 truncate dark:text-slate-200">{first.description || t('ledger.noDescription')}</span>
          )}
          {editable ? (
            <EditableCell
              type="date"
              value={first.date.slice(0, 10)}
              format={v => <span className="text-slate-500 text-xs whitespace-nowrap dark:text-slate-400">{formatDateShort(v)}</span>}
              onSave={v => editHeader(key, first, { date: String(v) })}
            />
          ) : (
            <span className="text-slate-500 text-xs whitespace-nowrap dark:text-slate-400">{formatDateShort(first.date)}</span>
          )}
          {others > 0 && <span className="badge-slate !text-[10px]" title={kind === 'production' ? t('ledger.alsoHasOperationLines', { n: others }) : t('ledger.alsoHasProductionLines', { n: others })}>{kind === 'production' ? t('ledger.moreOps', { n: others }) : t('ledger.moreBahan', { n: others })}</span>}
        </>
      )
    }
    const label = filters.groupBy === 'order'
      ? (key ? orderLabel(orders, key) : t('ledger.notLinkedToOrder'))
      : kind === 'production' ? supplierLabel(suppliers, Number(key)) : key || t('ledger.uncategorized')
    return (
      <>
        <span className="font-semibold text-navy-900 dark:text-slate-50">{label}</span>
        <span className="text-slate-500 text-xs dark:text-slate-400">{t('ledger.lineCount', { count: rows.length })}</span>
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
      {/* One toolbar for the sheet: the total and its actions, the filters, and
         the spend per supplier/category. It used to be a page heading (repeating
         the top bar and the tab above it), a filter card and a summary card, so
         a laptop showed the first line of the sheet about 470px down. */}
      <div className="card divide-y divide-slate-100 dark:divide-navy-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
            <span className="text-xl font-semibold text-navy-900 font-mono tabular-nums dark:text-slate-50">{formatRp(total)}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t('ledger.summary', { count: visible.length, kasBon: kasBonCount, period: searching ? t('ledger.allMonths') : periodLabel(searchPeriod) })}
            </span>
            {change != null && Number.isFinite(change) && (
              <span className={`text-xs font-medium ${change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {t('ledger.vsPrevious', { arrow: change > 0 ? '▲' : '▼', change: changeLabel(Math.abs(change), change > 0), period: prevName })}
              </span>
            )}
          </div>
          {budget != null && (
            <span className="flex items-center gap-2 text-xs text-slate-500 w-full sm:w-auto dark:text-slate-400">
              {t('ledger.budget', { amount: formatRp(budget) })}
              <span className="h-1.5 flex-1 sm:flex-none sm:w-20 rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
                <span className={`block h-full rounded-full ${total > budget ? 'bg-red-500' : total > budget * 0.8 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (total / budget) * 100)}%` }} />
              </span>
              <span className={total > budget ? 'text-red-600 font-medium dark:text-red-400' : ''}>{Math.round((total / budget) * 100)}%</span>
            </span>
          )}
          {/* On a phone: one row, New Kas Bon then Import, Export and Print,
              each still named (under its icon) so they aren't mixed up. */}
          <div className={isMobile ? 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5 w-full' : 'flex flex-wrap items-center gap-2 ml-auto'}>
            {(() => {
              const icon = isMobile ? 18 : 14
              const label = (text: string) => <span className={isMobile ? 'text-[11px] leading-none' : 'hidden min-[1400px]:inline'}>{text}</span>
              // Phone: icon over its name, so all three fit beside New Kas Bon.
              const side = isMobile ? 'btn-secondary !flex-col !gap-0.5 justify-center !px-2.5 !py-1' : 'btn-secondary btn-sm'
              const printKasBon = () => {
                const p = filters.period
                const qs = p.mode === 'range'
                  ? `mode=range&from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}`
                  : p.mode === 'all' ? 'mode=all'
                  : `mode=${p.mode}&year=${p.year}&month=${p.month}`
                navigate(`/finance/kasbon/print?${qs}`)
              }
              return <>
                <button className={side} onClick={() => setImportGrid(null)} title={t('ledger.importTitle')} aria-label={t('ledger.import')}><FileUp size={icon} />{label(t('ledger.import'))}</button>
                <button className={side} onClick={() => exportRows(sorted)} disabled={!visible.length} title={t('ledger.exportTitle')} aria-label={t('ledger.export')}><Download size={icon} />{label(t('ledger.export'))}</button>
                <button className={side} disabled={!visible.length} title={t('ledger.printTitle')} aria-label={t('ledger.print')} onClick={printKasBon}><Printer size={icon} />{label(t('ledger.print'))}</button>
                <button className={isMobile ? 'btn-primary justify-center order-first' : 'btn-primary btn-sm'} onClick={() => setForm({})} title={t('ledger.newKasBonTitle')} data-kbd="new" aria-keyshortcuts="n"><Plus size={isMobile ? 18 : 14} /> {t('ledger.newKasBon')}</button>
              </>
            })()}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <div className="relative flex-1 min-w-[8rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              ref={searchRef}
              data-kbd="search"
              aria-keyshortcuts="/"
              className="field !pl-8 !py-1.5"
              placeholder={t('ledger.searchPlaceholder')}
              value={filters.q}
              onChange={e => setFilter('q', e.target.value)}
            />
            {filters.q && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300" onClick={() => setFilter('q', '')} aria-label={t('ledger.clearSearch')}><X size={14} /></button>}
          </div>
          {isMobile && (
            <button type="button" className={`btn-secondary !py-1.5 gap-1.5 ${dropdownsSet ? '!border-navy-300 dark:!border-slate-400' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
              <SlidersHorizontal size={15} aria-hidden /> {t('ledger.filters')}
              {dropdownsSet > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-navy-900 text-white text-[11px] font-semibold inline-flex items-center justify-center dark:bg-gold-500 dark:text-navy-950">{dropdownsSet}</span>}
            </button>
          )}
          <PeriodPicker value={filters.period} onChange={p => setFilter('period', p)} />
          {/* A deliberate 2-up grid below `sm:`, Group-by spanning the full
             second row — the three selects used to each land alone on their
             own full-width-looking line (auto-width inside a wrapped flex
             row, with nothing beside them), every one a different width with
             empty space trailing it. `sm:contents` drops this wrapper from
             layout entirely from `sm:` up, so desktop is exactly as before:
             each select flows inline in the filter bar's own flex-wrap row. */}
          <div className={`grid-cols-2 gap-2 w-full sm:contents ${isMobile && !filtersOpen ? 'hidden' : 'grid'}`}>
            <select className="field !w-full sm:!w-36 !py-1.5 text-xs" value={filters.group} onChange={e => setFilter('group', e.target.value)} aria-label={kind === 'production' ? t('ledger.columns.supplier') : t('ledger.columns.category')}>
              <option value="">{kind === 'production' ? t('ledger.allSuppliers') : t('ledger.allCategories')}</option>
              {groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="field !w-full sm:!w-36 !py-1.5 text-xs" value={filters.order} onChange={e => setFilter('order', e.target.value)} aria-label={t('ledger.orderLink')}>
              <option value="any">{t('ledger.anyOrder')}</option>
              <option value="linked">{t('ledger.linkedToOrder')}</option>
              <option value="none">{t('ledger.notLinked')}</option>
              {[...new Set([...(['any', 'none', 'linked'].includes(filters.order) ? [] : [filters.order]), ...orders.slice(-100).reverse().map(o => o.id)])]
                .map(id => <option key={id} value={id}>{orderLabel(orders, id)}</option>)}
            </select>
            <select className="field !w-full sm:!w-auto !py-1.5 text-xs col-span-2 sm:col-span-1" value={filters.groupBy} onChange={e => setFilter('groupBy', e.target.value as GroupBy)} aria-label={t('ledger.groupBy')}>
              <option value="kasbon">{t('ledger.groupKasBon')}</option>
              <option value="group">{kind === 'production' ? t('ledger.groupSupplier') : t('ledger.groupCategory')}</option>
              <option value="order">{t('ledger.groupOrder')}</option>
              <option value="none">{t('ledger.noGroups')}</option>
            </select>
          </div>
        </div>

        {/* Spend per supplier/category: one slim row of pills that filter the
           sheet, scrolling sideways past what fits instead of a grid of cards. */}
        {groupTotals.length > 1 && (
          <ScrollX className="px-3 py-2.5">
            <div className="flex gap-1.5 w-max">
              {groupTotals.slice(0, 12).map(([key, sum]) => {
                const on = filters.group === key
                const max = groupTotals[0][1] || 1
                const sp = kind === 'production' ? suppliers.find(x => x.id === Number(key)) : undefined
                const name = kind === 'production' ? supplierLabel(suppliers, Number(key)) : key || t('ledger.uncategorized')
                return (
                  <button
                    key={key || 'none'}
                    onClick={() => setFilter('group', on ? '' : key)}
                    aria-pressed={on}
                    className={`relative shrink-0 flex items-center gap-2 rounded-full border pl-2.5 pr-3 py-1.5 text-xs overflow-hidden transition-colors ${on ? 'border-navy-900 bg-navy-50 dark:border-slate-300 dark:bg-white/10' : 'border-slate-200 hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-white/5'}`}
                    title={`${name} · ${on ? t('ledger.showAllAgain') : kind === 'production' ? t('ledger.onlyThisSupplier') : t('ledger.onlyThisCategory')}`}
                  >
                    {sp && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[sp.supplier_category] }} />}
                    <span className="max-w-[11rem] truncate text-slate-600 dark:text-slate-300">{name}</span>
                    <span className="font-mono tabular-nums text-navy-900 dark:text-slate-50">{formatRp(sum)}</span>
                    {/* Its share of the biggest, as the old cards showed. */}
                    <span aria-hidden className="absolute left-3 right-3 bottom-0.5 h-0.5 rounded-full bg-slate-100 dark:bg-white/10">
                      <span className="block h-full rounded-full bg-navy-500 dark:bg-navy-300" style={{ width: `${(sum / max) * 100}%` }} />
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollX>
        )}
      </div>

      {!visible.length ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {allRows.length ? t('ledger.nothingMatches') : t('ledger.noLinesYet')}
          <div className="mt-3 flex justify-center gap-2">
            {allRows.length > 0 && filtersActive && (
              <button className="btn-secondary btn-sm" onClick={clearFilters}><X size={14} /> {t('common.clearFilters')}</button>
            )}
            <button className="btn-primary btn-sm" onClick={() => setForm({})}><Plus size={14} /> {t('ledger.newKasBon')}</button>
            <button className="btn-secondary btn-sm" onClick={() => setImportGrid(null)}><FileUp size={14} /> {t('ledger.import')}</button>
          </div>
          <p className="mt-3 text-xs">{t('ledger.pasteTip')}</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className={`btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}>
              <CheckSquare size={14} /> {selectMode ? t('ledger.done') : t('ledger.select')}
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
                            const c = colorFromText(supplierLabel(suppliers, r.supplier_id), r.name, catalogues)
                            if (c) return <span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10 shrink-0" style={{ background: c.hex }} />
                            const d = designFromText(designs, r.supplier_id, r.name)
                            return d && <DesignThumb design={d} className="w-6 h-6 rounded shrink-0" />
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
                  <li><button className="w-full px-4 py-2 text-xs text-navy-600 text-left dark:text-navy-300" onClick={() => setForm({ headerId: group.key })}><Plus size={12} className="inline" /> {t('ledger.addLines')}</button></li>
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
            {/* table-layout:fixed only takes effect with a definite width; without
               one the browser lays the table out by content, and one long Bahan
               name pushed the Order column out of view even at 1440px. Full
               width, but never narrower than the fixed columns plus Bahan's
               12rem floor, below which it scrolls instead. The 2px leaves room
               for the collapsed outer gridlines, which otherwise add a scrollbar. */}
            <table data-density={density} className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: `max(calc(100% - 2px), ${fixedRem + 12}rem)` }}>
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
                    <input type="checkbox" aria-label={t('ledger.selectAllShown')} checked={allVisibleSelected} onChange={e => setMany(visible, e.target.checked)} />
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
              {/* The whole sheet is one Tab stop (see useRovingCells): arrows move,
                 Shift+Space selects the line, Del deletes the selected lines. */}
              <tbody onFocus={onGridFocus} onKeyDown={onGridKey}>
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
                  // Kas Bon rows stay pinned under the column headers while their
                  // lines scroll by; each one slides over the last. A collapsed
                  // table's borders don't move with a sticky cell, so the rule
                  // under it is drawn as a shadow too, as the header row does.
                  const pin = byKasBon ? 'sticky top-[33px] z-10 bg-slate-100 shadow-[0_2px_0_#cbd5e1] dark:bg-navy-900 dark:shadow-[0_2px_0_#3e4f8f]' : ''
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
                          <td className={`${cellBorder} ${pin} px-2 py-3`}>
                            <input
                              type="checkbox" aria-label={t('ledger.selectGroup')} checked={allIn} onChange={e => setMany(group.rows, e.target.checked)}
                              className={`block transition-opacity ${allIn ? '' : 'can-hover:opacity-0 group-hover/gh:opacity-100 focus:opacity-100'}`}
                            />
                          </td>
                          {/* Split across real column boundaries (not one wide flex cell)
                             so the group sum lines up under Total/Price instead of
                             floating to the row's far right, where it used to sit
                             right under the Order column and read as an order figure. */}
                          <td colSpan={sumColIndex} className={`${cellBorder} ${pin} px-2 py-3`}>
                            <div className="flex items-center gap-2.5 text-sm min-w-0">
                              <button onClick={() => setCollapsed(c => { const n = new Set(c); if (n.has(group.key)) n.delete(group.key); else n.add(group.key); return n })} className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200" aria-label={isCollapsed ? t('ledger.expand') : t('ledger.collapse')}>
                                <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                              </button>
                              {groupHeader(group.key, group.rows, true)}
                            </div>
                          </td>
                          {/* Clearer than it was, still lighter than each line's own bold Total
                             below; a solo line's Total already shows it, so it's left out. */}
                          <td className={`${cellBorder} ${pin} px-2 py-3 text-right font-mono tabular-nums whitespace-nowrap text-sm font-medium text-navy-700 dark:text-slate-300`}>
                            {!solo && amount(groupSum(group.rows))}
                          </td>
                          {sumColIndex < columns.length - 1 && (
                            <td colSpan={columns.length - sumColIndex - 1} className={`${cellBorder} ${pin}`} />
                          )}
                          <td className={`${cellBorder} ${pin} px-1 text-center`}>
                            {byKasBon && (
                              <span className="inline-flex items-center gap-1.5">
                                <button className="can-hover:opacity-0 group-hover/gh:opacity-100 focus-visible:opacity-100 text-slate-500 hover:text-navy-700 dark:text-slate-400" title={t('ledger.addLinesTo', { id: group.key })} aria-label={t('ledger.addLinesTo', { id: group.key })} onClick={() => setForm({ headerId: group.key })}>
                                  <Plus size={14} />
                                </button>
                                <button className="can-hover:opacity-0 group-hover/gh:opacity-100 focus-visible:opacity-100 text-slate-500 hover:text-navy-700 dark:text-slate-400" title={t('ledger.printId', { id: group.key })} aria-label={t('ledger.printId', { id: group.key })} onClick={() => navigate(`/finance/kasbon/print?id=${encodeURIComponent(group.key)}`)}>
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
                        <LedgerLine key={r.id} r={r} columns={columns} isSelected={selected.has(r.id)} actions={lineActions} />
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {flatShown.length < visible.length && (
              <div className="p-3 text-center border-t border-slate-200 dark:border-navy-700">
                <button className="btn-secondary btn-sm" onClick={() => setLimit(l => l + PAGE)}>{t('ledger.showMoreLeft', { n: visible.length - flatShown.length })}</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 px-4 py-2 border-t-2 border-slate-300 bg-slate-100 text-xs text-slate-500 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-400">
            <span>{t('ledger.tableHint')}</span>
            <div role="group" aria-label={t('ledger.density')} className="ml-auto inline-flex shrink-0 rounded-md border border-slate-300 bg-white p-0.5 dark:border-navy-600 dark:bg-navy-950">
              {(['comfortable', 'compact'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  title={d === 'compact' ? t('ledger.densityCompact') : t('ledger.densityComfortable')}
                  aria-label={d === 'compact' ? t('ledger.densityCompact') : t('ledger.densityComfortable')}
                  className={`rounded px-1.5 py-1 ${density === d ? 'bg-navy-900 text-white dark:bg-slate-200 dark:text-navy-950' : 'text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
                >
                  {d === 'compact' ? <Rows3 size={14} /> : <Rows2 size={14} />}
                </button>
              ))}
            </div>
            <span className="font-mono text-sm text-navy-900 font-semibold tabular-nums dark:text-slate-50">{formatRp(total)}</span>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 pointer-events-none dock:left-[var(--sidebar-w)]" data-bulk-bar>
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-navy-900 text-white shadow-2xl px-3 py-2 max-w-full">
            <span className="px-2 text-sm"><Trans i18nKey="ledger.selectedSummary" values={{ n: selected.size, amount: formatRp(selectedTotal) }} components={{ b: <span className="font-semibold" />, m: <span className="font-mono" /> }} /></span>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('move')}><ArrowRightLeft size={13} /> {t('ledger.move')}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog(kind === 'production' ? 'supplier_id' : 'category')}><Tag size={13} /> {kind === 'production' ? t('ledger.columns.supplier') : t('ledger.columns.category')}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => setDialog('order_id')}><Link2 size={13} /> {t('ledger.columns.order')}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" disabled={batch.isPending} onClick={() => duplicateRows(selectedRows)}><Copy size={13} /> {t('ledger.copy')}</button>
            <button className="btn-sm btn rounded-lg text-white/90 hover:bg-white/10" onClick={() => exportRows(selectedRows, t('ledger.exportSelectionSuffix'))}><Download size={13} /> {t('ledger.export')}</button>
            <button className="btn-sm btn rounded-lg text-red-200 hover:bg-red-500/20" onClick={() => setDialog('delete')}><Trash2 size={13} /> {t('common.delete')}</button>
            <button className="p-1.5 rounded-lg hover:bg-white/10" onClick={() => setSelected(new Set())} aria-label={t('ledger.clearSelection')}><X size={14} /></button>
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
          message={t('ledger.deleteLinesConfirm', { count: selected.size, amount: formatRp(selectedTotal) })}
          onConfirm={() => removeRows(selectedRows)}
          onCancel={() => setDialog(null)}
          focusConfirm
        />
      )}
      {confirmDeleteRow && (
        <ConfirmDialog
          message={t('ledger.deleteLineConfirm', { name: confirmDeleteRow.name || confirmDeleteRow.category, amount: formatRp(confirmDeleteRow.total) })}
          onConfirm={() => { removeRows([confirmDeleteRow]); setConfirmDeleteRow(null); setEditing(null) }}
          onCancel={() => setConfirmDeleteRow(null)}
          focusConfirm
        />
      )}
      {editing && (
        <LineEditor row={editing} suppliers={suppliers} orders={orders} categories={categories} saving={batch.isPending}
          onApply={(b, l) => apply(b, l, () => setEditing(null))}
          onDelete={() => setConfirmDeleteRow(editing)}
          onClose={() => setEditing(null)} />
      )}
      {designPickFor && (
        <DesignPickerModal
          supplierName={designPickFor.supplierName}
          designs={designPickFor.designs}
          currentPrice={designPickFor.row.price}
          selectedId={designPickFor.selectedId}
          onPick={(d, usePrice) => {
            const { row } = designPickFor
            // Bahan, unit and (if wanted) price as one change, one Undo.
            const b = editBatch([row], 'name', designLabel(d))
            const patch = b.production_update?.[0]
            if (patch) patch.fields = { ...patch.fields, si_unit: 'pcs', ...(usePrice && d.price ? { price: d.price } : {}) }
            apply(b, t('ledger.changedLine', { name: row.name }))
            setDesignPickFor(null)
          }}
          onClose={() => setDesignPickFor(null)}
        />
      )}
      {materialPickFor && (
        <CatalogueMaterialPickerModal
          supplierName={materialPickFor.supplierName}
          materials={materialPickFor.catalogue.materials}
          currentPrice={materialPickFor.row.price}
          onPick={(material, usePrice) => {
            const { row, catalogue } = materialPickFor
            const colors = catalogue.colorsFor(material)
            const price = usePrice && material.price ? material.price : undefined
            setMaterialPickFor(null)
            if (colors.length) setColorPickFor({ row, material, colors, price })
            else if (price != null && price !== row.price) {
              const b = editBatch([row], 'name', materialLabel(material))
              const patch = b.production_update?.[0]
              if (patch) patch.fields = { ...patch.fields, price }
              apply(b, t('ledger.changedLine', { name: row.name }))
            } else editRow(row, 'name', materialLabel(material))
          }}
          onClose={() => setMaterialPickFor(null)}
        />
      )}
      {colorPickFor && (
        <MaterialColorPickerModal
          material={colorPickFor.material}
          colors={colorPickFor.colors}
          selectedCode={colorPickFor.selectedCode}
          onPick={code => {
            const { row, material, price } = colorPickFor
            const name = `${materialLabel(material)} - ${code}`
            if (price != null && price !== row.price) {
              // Bahan and price as one change, so one Undo puts both back.
              const b = editBatch([row], 'name', name)
              const patch = b.production_update?.[0]
              if (patch) patch.fields = { ...patch.fields, price }
              apply(b, t('ledger.changedLine', { name: row.name }))
            } else editRow(row, 'name', name)
            setColorPickFor(null)
          }}
          onClose={() => setColorPickFor(null)}
        />
      )}
    </div>
  )
}
