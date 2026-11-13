import { ErrorState } from './Page'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Kbd } from '@/components/shortcuts/Kbd'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, MoreVertical, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog, EditableCell, EmptyState, TableSkeleton } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCreateOnArrival } from '@/hooks/useCreateOnArrival'
import { undoLastDelete } from '@/hooks/crud'
import { isTyping } from '@/utils/isTyping'
import { useRovingCells } from '@/hooks/useRovingCells'
import { useDialog } from '@/hooks/useDialog'

const PAGE_ROWS = 100
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
  /** Where the column goes on a phone's card: `title` (bold, first line),
   *  `meta` (the muted line under it, joined with ·), `amount` (right, in
   *  mono), `badge` (right, under the amount), `sheet` (only in the ⋯
   *  sheet's details) or `hide`. Unset: the title column is the title,
   *  `secondary` columns go in the sheet, the rest on the meta line. */
  card?: 'title' | 'meta' | 'amount' | 'badge' | 'sheet' | 'hide'
  /** What the card shows for this column, if not its usual render (e.g.
   *  "× 20" for a bare quantity). */
  cardRender?: (row: T) => React.ReactNode
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
  /** Inside another page (a client's contacts tab): no page padding of its own. */
  embedded?: boolean
  filterBar?: React.ReactNode
  /** Commits an inline edit from a column's `edit` config (see Column.edit)
   *  — e.g. `(row, key, value) => update.mutate({ id: row.id, body: { [key]: value } })`.
   *  Omit to keep every column read-only regardless of their `edit` config. */
  onCellEdit?: (row: T, key: string, value: unknown) => void
}

export function CrudPage<T extends { id: string | number }>({
  title, icon: Icon, data = [], isLoading, isError = false, onRetry, embedded = false,
  columns, formTitle, renderForm, onDelete,
  deleteMessage, searchKeys = [], rowActions, rowHref, undoDeletes = false, onEditClick, onAddClick, filterBar, onCellEdit,
}: CrudPageProps<T>) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [confirmRow, setConfirmRow] = useState<T | null>(null)
  // Phones: the row whose ⋯ sheet (details and actions) is open.
  const [sheetRow, setSheetRow] = useState<T | null>(null)
  // The search survives opening a row and coming back (sessionStorage, keyed
  // by the page title).
  const searchStorageKey = `crud-search:${title}`
  const [search, setSearchState] = useState(() => {
    try { return sessionStorage.getItem(searchStorageKey) ?? '' } catch { return '' }
  })
  // Long lists show a page at a time (with "Show more"), like the Ledger:
  // drawing 500 orders at once froze slower laptops for half a second.
  const [limit, setLimit] = useState(PAGE_ROWS)
  const setSearch = (value: string) => {
    setSearchState(value)
    setLimit(PAGE_ROWS)
    try { sessionStorage.setItem(searchStorageKey, value) } catch { /* private mode / quota — search just won't persist */ }
  }
  // The box shows each keystroke at once; the list filters a beat behind.
  const query = useDeferredValue(search)

  const filtered = query
    ? data.filter(row =>
        searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(query.toLowerCase()))
      )
    : data
  const pageRows = filtered.length > limit ? filtered.slice(0, limit) : filtered

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
  const rowOpens = !!rowHref && !onCellEdit
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
    const i = pageRows.findIndex(r => r.id === rowId)
    if (i < 0) return
    const row = pageRows[Math.min(Math.max(i + dRow, 0), pageRows.length - 1)]
    const c = Math.min(Math.max(col + dCol, 0), tableColumns.length - 1)
    if (row) cellRefs.current.get(`${row.id}:${c}`)?.focus()
  }
  const arrowDeltas: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  }

  return (
    <div className={embedded ? 'pt-4' : 'p-4 md:p-6'}>
      {/* One toolbar instead of a second title block: the top bar already
          names the page. The heading stays for screen readers. */}
      <h2 className="sr-only">{title}</h2>
      <div className="flex flex-wrap items-center gap-3 mb-4 fade-up">
        {searchKeys.length > 0 && (
          <div className="relative flex-1 min-w-[12rem] sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
            <input
              data-kbd="search"
              aria-keyshortcuts="/"
              className="field !pl-9 !pr-9 !py-2 text-sm"
              placeholder={t('common.searchPlaceholder', { what: title.toLowerCase() })}
              aria-label={t('common.searchPlaceholder', { what: title.toLowerCase() })}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {/* The key that jumps here, while there's room for it. */}
            {!search && <Kbd className="hidden dock:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">/</Kbd>}
          </div>
        )}
        {filterBar}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs text-slate-500 tabular-nums dark:text-slate-400" aria-live="polite">
            {t('common.record', { count: filtered.length })}
          </span>
          <button className="btn-primary" onClick={openCreate} data-kbd="new" aria-keyshortcuts="n" title={t('shortcuts.withKey', { action: t('common.addNew'), key: 'N' })}>
            <Plus className="w-4 h-4" />
            {t('common.addNew')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card fade-up delay-2 overflow-hidden">
        {isLoading ? (
          <TableSkeleton columns={isMobile ? 2 : columns.filter(c => !c.mobileOnly).length + 1} />
        ) : isError ? (
          <ErrorState what={title.toLowerCase()} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          search
            ? <EmptyState icon={Icon} title={t('common.nothingMatches', { search })} subtitle={t('common.tryAnotherSearch')}
                action={<button className="btn-secondary btn-sm" onClick={() => setSearch('')}>{t('common.clearSearch')}</button>} />
            : <EmptyState icon={Icon} title={t('common.noItemsYet', { items: title.toLowerCase() })} subtitle={t('common.clickAddNew')} />
        ) : isMobile ? (
          // Phone width: a compact card per row — the title in bold with the
          // amount on the right, one muted line under it (id, date…) with the
          // status badge — and tapping it opens the row. Everything else (the
          // remaining details, the row's actions, Edit, Delete) is behind one
          // ⋯ button, instead of label: value lines, "Show more" and a row of
          // icons on every card.
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {pageRows.map(row => {
              const cell = (c: Column<typeof row>, forCard = true) => (forCard && c.cardRender)
                ? c.cardRender(row)
                : c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')
              const titleCol = columns.find(c => c.card === 'title') ?? columns.find(c => c.key === titleKey)
              const placeOf = (c: Column<typeof row>) => c === titleCol ? 'title' : c.card ?? (c.secondary ? 'sheet' : 'meta')
              const metaCols = columns.filter(c => placeOf(c) === 'meta')
              const amountCol = columns.find(c => placeOf(c) === 'amount')
              const badgeCol = columns.find(c => placeOf(c) === 'badge')
              const href = rowHref?.(row)
              const open = () => (href ? navigate(href) : openEdit(row))
              return (
                <div
                  key={row.id}
                  className="flex items-start gap-1 pl-4 pr-1 py-3 cursor-pointer active:bg-slate-50 dark:active:bg-navy-800/50"
                  onClick={e => {
                    // Buttons and links inside the card keep their own job.
                    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return
                    open()
                  }}
                >
                  {/* Left: the title and the muted line (id, date…), wrapping
                      as a whole; right: the amount over the status badge. */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium leading-snug text-navy-900 break-words dark:text-slate-50">
                      {titleCol ? cell(titleCol) : String(row.id)}
                    </div>
                    {metaCols.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {/* An empty value (a bare "—") is left off the line. */}
                        {metaCols.map(c => [c, cell(c)] as const).filter(([, v]) => v !== '—' && v !== '' && v != null).map(([c, v]) => <span key={String(c.key)} className="min-w-0 truncate">{v}</span>)}
                      </div>
                    )}
                  </div>
                  {(amountCol || badgeCol) && (
                    <div className="shrink-0 flex flex-col items-end gap-1.5 pl-2">
                      {amountCol && <div className="font-mono font-semibold text-sm tabular-nums text-navy-900 whitespace-nowrap text-right dark:text-slate-50">{cell(amountCol)}</div>}
                      {badgeCol && <div>{cell(badgeCol)}</div>}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSheetRow(row)}
                    className="shrink-0 w-11 h-11 -my-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                    aria-label={t('crud.moreFor', { name: titleCol ? String((row as Record<string, unknown>)[titleCol.key as string] ?? row.id) : String(row.id) })}
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
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
            {pageRows.map(row => (
              <tr
                key={row.id}
                // A list with a page per row and no in-cell editing opens it
                // from anywhere on the row (not just the small eye icon);
                // its buttons and links keep their own jobs.
                className={`group/row ${rowOpens ? 'cursor-pointer' : ''}`}
                onClick={rowOpens ? e => {
                  if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[role="button"]')) return
                  if (window.getSelection()?.toString()) return // selecting text to copy isn't a click
                  navigate(rowHref!(row))
                } : undefined}
              >
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
                  {/* Quiet until the row is pointed at or tabbed into, so a
                      column of icons doesn't compete with the data; still
                      visible (and on touch screens, full strength). */}
                  <div className="flex items-center justify-end gap-1 transition-opacity [@media(hover:hover)]:opacity-65 group-hover/row:opacity-100 focus-within:!opacity-100">
                    {rowActions && rowActions(row)}
                    <button className="btn-ghost btn-sm !px-2" onClick={() => openEdit(row)} aria-label={t('common.edit')} title={t('common.edit')}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="btn-ghost btn-sm !px-1.5 hover:!text-red-600"
                      onClick={() => setConfirmRow(row)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
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
        {!isLoading && !isError && filtered.length > pageRows.length && (
          <div className="flex justify-center px-4 py-3 border-t border-slate-100 dark:border-navy-800">
            <button className="btn-secondary btn-sm" onClick={() => setLimit(l => l + PAGE_ROWS)}>
              {t('common.showMoreLeft', { n: filtered.length - pageRows.length })}
            </button>
          </div>
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

      {/* Phones: a row's details and actions. */}
      {sheetRow && (() => {
        const row = sheetRow
        const titleCol = columns.find(c => c.card === 'title') ?? columns.find(c => c.key === titleKey)
        const details = columns.filter(c => c !== titleCol && c.card !== 'hide' && c.header)
        const value = (c: Column<T>) => c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')
        return (
          <RowSheet
            title={titleCol ? value(titleCol) : String(row.id)}
            onClose={() => setSheetRow(null)}
            details={details.map(c => ({ label: c.header, value: value(c) }))}
            actions={rowActions?.(row)}
            onEdit={() => { setSheetRow(null); openEdit(row) }}
            onDelete={() => { setSheetRow(null); setConfirmRow(row) }}
          />
        )
      })()}

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

/** Phones: a list row's ⋯ sheet — its details, then its actions by name
 *  (the page's own, Edit, and Delete set apart at the bottom). */
function RowSheet({ title, details, actions, onEdit, onDelete, onClose }: {
  title: React.ReactNode
  details: { label: string; value: React.ReactNode }[]
  actions?: React.ReactNode
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1}
        className="w-full max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl slide-up outline-none pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-navy-900">
        <div className="sticky top-0 z-[1] flex items-start gap-3 bg-white px-4 pt-4 pb-3 border-b border-slate-100 dark:bg-navy-900 dark:border-navy-800">
          <div className="flex-1 min-w-0 text-base font-semibold text-navy-900 break-words dark:text-slate-50">{title}</div>
          <button type="button" onClick={onClose} className="btn-ghost !px-0 -mt-2 -mr-1" aria-label={t('common.close')}><X className="w-5 h-5" /></button>
        </div>
        {details.length > 0 && (
          <dl className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {details.map(d => (
              <div key={d.label} className="contents">
                <dt className="text-slate-500 dark:text-slate-400">{d.label}</dt>
                <dd className="text-navy-900 min-w-0 break-words dark:text-slate-100">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {/* The page's own actions are icon buttons; here each shows its
            name (its aria-label) beside the icon, as a full-width row. */}
        <div className="px-2 pt-1 border-t border-slate-100 dark:border-navy-800
          [&_button]:!w-full [&_button]:!justify-start [&_button]:!gap-3 [&_button]:!px-3 [&_button]:!min-h-[3rem] [&_button]:!text-sm [&_button]:text-navy-800 dark:[&_button]:text-slate-100
          [&_.row-action_button]:after:content-[attr(aria-label)] [&_.row-action_div]:!flex [&_.row-action_div]:!flex-col [&_.row-action_div]:!items-stretch [&_.row-action_div]:!gap-0">
          {actions && <div className="row-action">{actions}</div>}
          <button type="button" className="btn-ghost" onClick={onEdit}><Pencil className="w-4 h-4" /> {t('common.edit')}</button>
          <button type="button" className="btn-ghost !text-red-600 dark:!text-red-400" onClick={onDelete}><Trash2 className="w-4 h-4" /> {t('common.delete')}</button>
        </div>
      </div>
    </div>
  )
}
