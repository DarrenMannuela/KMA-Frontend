import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog, Spinner, EmptyState } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'

export interface Column<T> {
  header: string
  key: keyof T | string
  render?: (row: T) => React.ReactNode
  /** Mobile cards only: use this column as the card's title instead of the first
   *  column (when the first is a bare id). Set on one column at most. */
  primary?: boolean
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
  // Replaces the built-in edit modal (e.g. Invoices edit on their own page).
  onEditClick?: (row: T) => void
  // Same, for Add New.
  // Extra controls next to the search box (e.g. Invoices' Paid/Unpaid toggle).
  onAddClick?: () => void
  filterBar?: React.ReactNode
}

export function CrudPage<T extends { id: string | number }>({
  title, icon: Icon, data = [], isLoading, isError = false, onRetry,
  columns, formTitle, renderForm, onDelete,
  deleteMessage, searchKeys = [], rowActions, onEditClick, onAddClick, filterBar,
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
  const isMobile = useIsMobile()
  const titleKey = columns.find(c => c.primary)?.key ?? columns[0]?.key

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 fade-up">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center">
            <Icon className="w-4 h-4 text-gold-400" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-navy-900">{title}</h2>
            <p className="text-slate-400 text-xs">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add New
        </button>
      </div>

      {/* Search + optional filter bar */}
      {(searchKeys.length > 0 || filterBar) && (
        <div className="flex items-center gap-3 mb-4 fade-up delay-1">
          {searchKeys.length > 0 && (
            <div className="relative w-full sm:max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="field !pl-9 !py-2 text-sm"
                placeholder={`Search ${title.toLowerCase()}…`}
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
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <AlertTriangle className="w-10 h-10 mb-3 text-red-300" />
            <p className="font-medium text-slate-500 text-sm">Couldn't load {title.toLowerCase()}</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Check your connection and try again.</p>
            {onRetry && (
              <button className="btn-secondary btn-sm" onClick={onRetry}>Retry</button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Icon} title={`No ${title.toLowerCase()} yet`} subtitle="Click Add New to create one" />
        ) : isMobile ? (
          // Phone width: one card per row (title column first, the rest as
          // label: value), with the row actions as icons underneath.
          <div className="divide-y divide-slate-100">
            {filtered.map(row => (
              <div key={row.id} className="px-5 py-3">
                <div className="space-y-0.5">
                  {columns.map((c) => {
                    const rendered = c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')
                    if (c.key === titleKey) {
                      return <div key={String(c.key)} className="text-sm font-medium text-navy-900">{rendered}</div>
                    }
                    return (
                      <div key={String(c.key)} className="flex items-baseline gap-1.5 text-sm">
                        <span className="text-slate-400 text-xs shrink-0">{c.header}:</span>
                        <span className="text-slate-700 truncate">{rendered}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  {rowActions && rowActions(row)}
                  <button className="btn-ghost btn-sm !px-2" onClick={() => openEdit(row)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="btn-ghost btn-sm !px-1.5 hover:!text-red-600"
                    onClick={() => setConfirmRow(row)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">

        <table className="kma-table">
          <thead>
            <tr>
              {columns.map(c => <th key={String(c.key)}>{c.header}</th>)}
              <th>
                <div className="flex items-center justify-end">Actions</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                {columns.map(c => (
                  <td key={String(c.key)}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? '—')}
                  </td>
                ))}
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {rowActions && rowActions(row)}
                    <button className="btn-ghost btn-sm !px-2" onClick={() => openEdit(row)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="btn-ghost btn-sm !px-1.5 hover:!text-red-600"
                      onClick={() => setConfirmRow(row)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          message={deleteMessage ? deleteMessage(confirmRow) : `Delete this record?`}
          onConfirm={() => { onDelete(confirmRow.id); setConfirmRow(null) }}
          onCancel={() => setConfirmRow(null)}
        />
      )}
    </div>
  )
}