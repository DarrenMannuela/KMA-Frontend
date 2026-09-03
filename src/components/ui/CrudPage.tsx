import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog, Spinner, EmptyState } from '@/components/ui'

export interface Column<T> {
  header: string
  key: keyof T | string
  render?: (row: T) => React.ReactNode
}

interface CrudPageProps<T extends { id: string | number }> {
  title: string
  icon: LucideIcon
  data: T[] | undefined
  isLoading: boolean
  // Distinct from "loaded successfully and there's just nothing yet" — a
  // failed fetch previously fell through to the same EmptyState as a
  // genuinely empty table ("No invoices yet — click Add New"), which sent
  // people looking for data that was never actually missing, just
  // unreachable. Optional and defaults to false so existing callers that
  // haven't wired their query's isError through keep behaving exactly as
  // before; `data` is expected to be undefined/[] in the error case same
  // as it already is during loading.
  isError?: boolean
  onRetry?: () => void
  columns: Column<T>[]
  formTitle: (editing: T | null) => string
  renderForm: (editing: T | null, onClose: () => void) => React.ReactNode
  onDelete: (id: string | number) => void
  deleteMessage?: (row: T) => string
  searchKeys?: (keyof T)[]
  rowActions?: (row: T) => React.ReactNode
  // Override for the built-in pencil button. Some pages (e.g. Invoices)
  // don't edit through this generic modal at all — editing happens on a
  // dedicated page/flow elsewhere. When provided, the pencil calls this
  // instead of opening the (otherwise empty) generic form modal.
  onEditClick?: (row: T) => void
  // Same idea, for the "Add New" button.
  // Same idea as onEditClick/onAddClick — an escape hatch for page-specific
  // needs without baking them into this generic component. Rendered next
  // to the search box; e.g. Invoices uses it for a Paid/Unpaid toggle.
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
  const [search, setSearch] = useState('')

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
            <div className="relative max-w-xs flex-1">
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