import { PageHeader, ErrorState } from './Page'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog, EditableCell, Spinner, EmptyState } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCreateOnArrival } from '@/hooks/useCreateOnArrival'
import { undoLastDelete } from '@/hooks/crud'
import { isTyping } from '@/utils/isTyping'
import { useRovingCells } from '@/hooks/useRovingCells'
import { ScrollX } from './ScrollX'

interface Column<T> {
  header: string
  key: keyof T | string
  render?: (row: T) => React.ReactNode
  /** Mobile cards only: use this column as the card's title instead of the first
   *  column (when the first is a bare id). Set on one column at most. */
  primary?: boolean
  /** Mobile cards only: tucked behind a "Show more" toggle instead of
   *  printed on every card by default. A 6-7 column table (common here)
   *  becomes 6-7 label:value lines per card on a phone — fine for the
   *  desktop table, a lot to scroll past on mobile. Mark the columns that
   *  aren't needed for an at-a-glance read of the row; leave the rest
   *  (including columns with neither flag) visible as before. */
  secondary?: boolean
  /** Mobile cards only: left out of the desktop table (whose other cells
   *  already carry it), so a wide table fits the screen. */
  mobileOnly?: boolean
  /** Desktop table only: click the cell (or arrow onto it and type) to edit
   *  in place, like the finance Ledger, instead of needing the Add/Edit
   *  modal for this field. Needs `onCellEdit` on CrudPage itself — a column
   *  with `edit` set but no `onCellEdit` passed just renders normally. */
  edit?: {
    type?: 'text' | 'number' | 'select' | 'date'
    options?: { value: string | number; label: string }[]
    uppercase?: boolean
    suggestions?: string[]
    /** The value shown/edited, if not simply row[key] (e.g. an ISO date
     *  string trimmed to the yyyy-mm-dd a date input needs). */
    value?: (row: T) => string | number | null
  }
}

interface CrudPageProps<T extends { id: string | number }> {
  title: string
  icon: LucideIcon
  data: T[] | undefined
  isLoading: boolean
  // A failed fetch shows an error with Retry, not the empty state.
  isError?: boolean
  onRetry?: () => void
  columns: Column<T>[]
  formTitle: (editing: T | null) => string
  renderForm: (editing: T | null, onClose: () => void) => React.ReactNode
  onDelete: (id: string | number) => void
  deleteMessage?: (row: T) => string
  searchKeys?: (keyof T)[]
  rowActions?: (row: T) => React.ReactNode
  /** The row's own page. On phones the whole card opens it, instead of only
   *  a small icon; the desktop table keeps its cells for inline editing. */
  rowHref?: (row: T) => string
  /** Deleting here can be undone (the backend keeps what was removed): the
   *  confirm says so, the toast carries Undo, and Ctrl+Z puts back the most
   *  recent one. */
  undoDeletes?: boolean
  // Replaces the built-in edit modal (e.g. Invoices edit on their own page).
  onEditClick?: (row: T) => void
  // Same, for Add New.
  // Extra controls next to the search box (e.g. Invoices' Paid/Unpaid toggle).
  onAddClick?: () => void
  filterBar?: React.ReactNode
  /** Commits an inline edit from a column's `edit` config (see Column.edit)
   *  — e.g. `(row, key, value) => update.mutate({ id: row.id, body: { [key]: value } })`.
   *  Omit to keep every column read-only regardless of their `edit` config. */
  onCellEdit?: (row: T, key: string, value: unknown) => void
}

export function CrudPage<T extends { id: string | number }>({
  title, icon: Icon, data = [], isLoading, isError = false, onRetry,
  columns, formTitle, renderForm, onDelete,
  deleteMessage, searchKeys = [], rowActions, rowHref, undoDeletes = false, onEditClick, onAddClick, filterBar, onCellEdit,
}: CrudPageProps<T>) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [confirmRow, setConfirmRow] = useState<T | null>(null)
  // The search survives opening a row and coming back (sessionStorage, keyed
  // by the page title).
  const searchStorageKey = `crud-search:${title}`
  const [search, setSearchState] = useState(() => {
    try { return sessionStorage.getItem(searchStorageKey) ?? '' } catch { return '' }
  })
  const setSearch = (value: string) => {
    setSearchState(value)
    try { sessionStorage.setItem(searchStorageKey, value) } catch { /* private mode / quota — search just won't persist */ }
  }

  const filtered = search
    ? data.filter(row =>
        searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(search.toLowerCase()))
      )
    : data

  const openCreate = () => {
    if (onAddClick) { onAddClick(); return }
    setEditing(null); setModalOpen(true)
  }
  const openEdit   = (row: T) => {
    if (onEditClick) { onEditClick(row); return }
    setEditing(row); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null) }
  useCreateOnArrival(openCreate)

  const qc = useQueryClient()
  useEffect(() => {
    if (!undoDeletes) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.shiftKey || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      undoLastDelete(qc)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoDeletes, qc])
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const titleKey = columns.find(c => c.primary)?.key ?? columns[0]?.key
  const { t } = useTranslation()

  // ── Inline-edit cell navigation (arrow keys between cells, like Excel) ───
  // Only wired up when a page opts in via onCellEdit — otherwise the table
  // renders exactly as it always has.
  const cellRefs = useRef(new Map<string, HTMLElement>())
  const onGridFocus = useRovingCells(cellRefs)
  const tableColumns = columns.filter(c => !c.mobileOnly)
  const setCellRef = (key: string) => (el: HTMLElement | null) => {
    if (el) cellRefs.current.set(key, el)
    else cellRefs.current.delete(key)
  }
  const moveFocus = (rowId: string | number, col: number, dRow: number, dCol: number) => {
    const i = filtered.findIndex(r => r.id === rowId)
    if (i < 0) return
    const row = filtered[Math.min(Math.max(i + dRow, 0), filtered.length - 1)]
    const c = Math.min(Math.max(col + dCol, 0), tableColumns.length - 1)
    if (row) cellRefs.current.get(`${row.id}:${c}`)?.focus()
  }
  const arrowDeltas: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  }

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        icon={Icon}
        title={title}
        subtitle={`${t('common.record', { count: filtered.length })}${search ? ` ${t('common.matchingSearch', { search })}` : ''}`}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {t('common.addNew')}
          </button>
        }
      />

      {/* Search + optional filter bar */}
      {(searchKeys.length > 0 || filterBar) && (
        <div className="flex items-center gap-3 mb-4 fade-up delay-1">
          {searchKeys.length > 0 && (
            <div className="relative w-full sm:max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="field !pl-9 !py-2 text-sm"
                placeholder={t('common.searchPlaceholder', { what: title.toLowerCase() })}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          {filterBar}
        </div>
      )}

      {/* Table */}
      <div className="card fade-up delay-2 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState what={title.toLowerCase()} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          search
            ? <EmptyState icon={Icon} title={t('common.nothingMatches', { search })} subtitle={t('common.tryAnotherSearch')} />
            : <EmptyState icon={Icon} title={t('common.noItemsYet', { items: title.toLowerCase() })} subtitle={t('common.clickAddNew')} />
        ) : isMobile ? (
          // Phone width: one card per row (title column first, the rest as
          // label: value), with the row actions as icons underneath. Columns
          // marked `secondary` sit behind a "Show more" toggle instead of
          // printing on every card — the desktop table still shows all of
          // them unconditionally, since it isn't the one doing the scrolling.
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {filtered.map(row => {
              const renderLine = (c: Column<typeof row>) => {
                const rendered = c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')
                return (
                  <div key={String(c.key)} className="flex items-baseline gap-1.5 text-sm">
                    {c.header && <span className="text-slate-500 text-xs shrink-0 dark:text-slate-400">{c.header}:</span>}
                    <span className="text-slate-700 truncate dark:text-slate-300">{rendered}</span>
                  </div>
                )
              }
              const visibleCols = columns.filter(c => c.key !== titleKey && !c.secondary)
              const hiddenCols = columns.filter(c => c.key !== titleKey && c.secondary)
              const titleCol = columns.find(c => c.key === titleKey)
              const href = rowHref?.(row)
              return (
              <div
                key={row.id}
                className={`px-5 py-3 ${href ? 'cursor-pointer active:bg-slate-50 dark:active:bg-navy-800/50' : ''}`}
                onClick={href ? e => {
                  // Buttons, links and "Show more" inside the card keep their own job.
                  if ((e.target as HTMLElement).closest('a,button,input,select,textarea,summary,label')) return
                  navigate(href)
                } : undefined}
              >
                <div className="space-y-0.5">
                  {titleCol && (
                    <div className="flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-slate-100">
                      <div className="min-w-0 flex-1">
                        {titleCol.render ? titleCol.render(row) : String((row as Record<string, unknown>)[titleCol.key as string] ?? '—')}
                      </div>
                      {href && <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />}
                    </div>
                  )}
                  {visibleCols.map(renderLine)}
                  {hiddenCols.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-1 text-xs text-navy-500 dark:text-navy-300 cursor-pointer select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none pt-0.5">
                        <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                        {t('common.showMore')}
                      </summary>
                      <div className="space-y-0.5 pt-0.5">
                        {hiddenCols.map(renderLine)}
                      </div>
                    </details>
                  )}
                </div>
                {/* 40px targets, and Delete set apart from Edit, so a thumb
                   reaching for one doesn't land on the other. */}
                <div className="flex items-center justify-end gap-1 mt-1.5 [&_button]:min-h-10 [&_button]:min-w-10 [&_button]:justify-center">
                  {rowActions && rowActions(row)}
                  <button className="btn-ghost btn-sm !px-2" onClick={() => openEdit(row)} aria-label={t('common.edit')}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    className="btn-ghost btn-sm !px-1.5 ml-3 hover:!text-red-600"
                    onClick={() => setConfirmRow(row)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <ScrollX mask={false}>

        <table className="kma-table">
          <thead>
            <tr>
              {tableColumns.map(c => <th key={String(c.key)}>{c.header}</th>)}
              {/* Pinned to the right edge: view/edit/delete never scroll out of
                 reach on a narrow screen; the shadow shows only while other
                 columns are hidden under it. */}
              <th className="sticky right-0 z-[1] bg-white dark:bg-navy-900 [[data-fade-right]_&]:shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.22)]">
                <div className="flex items-center justify-end">{t('common.actions')}</div>
              </th>
            </tr>
          </thead>
          <tbody onFocus={onGridFocus}>
            {filtered.map(row => (
              <tr key={row.id}>
                {tableColumns.map((c, ci) => (
                  <td key={String(c.key)} className={onCellEdit ? 'px-1 py-0.5' : undefined}>
                    {!onCellEdit ? (
                      c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')
                    ) : c.edit ? (
                      <EditableCell
                        value={c.edit.value ? c.edit.value(row) : (row as Record<string, unknown>)[c.key as string]}
                        type={c.edit.type}
                        options={c.edit.options}
                        uppercase={c.edit.uppercase}
                        suggestions={c.edit.suggestions}
                        format={() => (c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—'))}
                        onSave={v => onCellEdit(row, c.key as string, v)}
                        cellRef={setCellRef(`${row.id}:${ci}`)}
                        tabIndex={-1}
                        onNavigate={(dr, dc) => moveFocus(row.id, ci, dr, dc)}
                      />
                    ) : (
                      <div
                        ref={setCellRef(`${row.id}:${ci}`)}
                        tabIndex={-1}
                        className="px-2.5 py-1.5 min-h-[2rem] flex items-center focus:outline-none focus:bg-navy-50/50 dark:focus:bg-navy-800/50 rounded-sm"
                        onKeyDown={e => {
                          const d = arrowDeltas[e.key]
                          if (d) { e.preventDefault(); moveFocus(row.id, ci, d[0], d[1]) }
                        }}
                      >
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')}
                      </div>
                    )}
                  </td>
                ))}
                <td className="text-right sticky right-0 z-[1] bg-white dark:bg-navy-900 [[data-fade-right]_&]:shadow-[-8px_0_12px_-6px_rgba(15,23,42,0.22)] [tr:hover>&]:bg-slate-50 dark:[tr:hover>&]:bg-[#1f2539]">
                  <div className="flex items-center justify-end gap-1">
                    {rowActions && rowActions(row)}
                    <button className="btn-ghost btn-sm !px-2" onClick={() => openEdit(row)} aria-label={t('common.edit')}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="btn-ghost btn-sm !px-1.5 hover:!text-red-600"
                      onClick={() => setConfirmRow(row)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </ScrollX>
        )}
        {onCellEdit && !isMobile && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500 dark:border-navy-800 dark:bg-navy-950/60 dark:text-slate-400">
            {t('common.inlineEditHint')}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <Modal title={formTitle(editing)} onClose={closeModal} size="md">
          {renderForm(editing, closeModal)}
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmRow && (
        <ConfirmDialog
          message={`${deleteMessage ? deleteMessage(confirmRow) : t('common.deleteThisRecord')}${undoDeletes ? ` ${t('common.canUndoAfter')}` : ''}`}
          onConfirm={() => { onDelete(confirmRow.id); setConfirmRow(null) }}
          onCancel={() => setConfirmRow(null)}
        />
      )}
    </div>
  )
}