import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { ColumnDef } from './SpreadsheetView'
import { Modal } from './Modal'
import { ConfirmDialog, FormField, UppercaseField, formatRp } from './index'

// ─────────────────────────────────────────────────────────────────────────────
// A phone-width alternative to SpreadsheetView, sharing the exact same
// ColumnDef-driven props (data/columns/groupByKey/calculateSubtotal/
// onCreateRow/onUpdateRow/onDeleteRow/emptyRowTemplate/requiredColumns/
// renderGroupHeader) so any page already built around SpreadsheetView can
// swap in this component for narrow viewports without touching its own
// column definitions or CRUD wiring at all — see useIsMobile + the
// conditional render in ProductionSpreadsheet/OperationsSpreadsheet for how
// that swap actually happens.
//
// Why a separate component rather than a responsive mode bolted onto
// SpreadsheetView itself: SpreadsheetView's interaction model is built
// entirely around a keyboard-navigable grid — arrow-key cell-to-cell
// movement, a persistent "type into a blank row to create it" buffer,
// per-cell inline edit-in-place. None of that translates to touch: there's
// no hover state to reveal affordances, no keyboard to arrow between
// cells, and a blank row sitting at the bottom of a long scrolling list is
// a much worse "add a new entry" pattern on a phone than a single explicit
// button that opens a real form. Rather than teach one already-complex,
// keyboard-focused component two very different interaction models, this
// is a second, purpose-built renderer for the touch case: a grouped card
// list (tap a card to edit it in a modal form) plus one explicit "Add"
// button (opens the same form blank). Both read the same ColumnDef list,
// so a column's `format`/`type`/`options`/`suggestions`/`uppercase` all
// still apply identically — only how it's laid out changes.
// ─────────────────────────────────────────────────────────────────────────────

interface MobileEntryListProps<T extends { id: string | number }> {
  data: T[]
  columns: ColumnDef<T>[]
  groupByKey?: keyof T | ((row: T) => string)
  calculateSubtotal?: (row: T) => number
  onUpdateRow: (id: string, updatedRow: T) => void
  onDeleteRow?: (id: string) => void
  /** The primary-key column. Defaults to 'id'. Never shown as a field —
   *  same convention as SpreadsheetView. */
  keyColumn?: keyof T
  /** Same contract as SpreadsheetView's onCreateRow: normally void
   *  (optimistic, the form just closes), or return Promise<boolean> if
   *  creation needs a confirmation step first (e.g. NewKasBonDateModal) —
   *  resolving false keeps this form open with what was typed intact
   *  instead of discarding it. */
  onCreateRow?: (row: Partial<T>) => void | Promise<boolean>
  /** Columns that must all be non-empty before "Add" is enabled. */
  requiredColumns?: (keyof T)[]
  emptyRowTemplate?: () => Partial<T>
  defaultCollapsedGroups?: string[]
  renderGroupHeader?: (groupName: string, rows: T[]) => React.ReactNode
  /** Label on the add button and the create-modal's title, e.g. "Add
   *  Entry" or "Add Row" — matches whatever the desktop page calls it. */
  addLabel?: string
}

export function MobileEntryList<T extends { id: string | number }>({
  data,
  columns,
  groupByKey,
  calculateSubtotal,
  onUpdateRow,
  onDeleteRow,
  keyColumn = 'id' as keyof T,
  onCreateRow,
  requiredColumns,
  emptyRowTemplate,
  defaultCollapsedGroups = [],
  renderGroupHeader,
  addLabel = 'Add Entry',
}: MobileEntryListProps<T>) {
  const editableColumns = columns.filter(c => c.editable)
  // What actually renders on a card's own face — excludes anything marked
  // hideOnCard (see that field's own comment on ColumnDef), even though
  // such a column still shows up in editableColumns above and so still
  // gets a field in the create/edit form.
  const cardColumns = columns.filter(c => !c.hideOnCard)
  const required = requiredColumns ?? []

  // ── Grouping — identical logic to SpreadsheetView's, kept as a plain
  // local copy rather than a shared import since the two components don't
  // otherwise depend on each other and this is a handful of lines. ──────
  const groups: Record<string, { rows: T[]; subtotal: number }> = {}
  const defaultGroup = 'All Records'
  data.forEach(row => {
    let groupName = defaultGroup
    if (typeof groupByKey === 'function') {
      groupName = groupByKey(row)
    } else if (groupByKey) {
      const raw = row[groupByKey]
      groupName = raw === null || raw === undefined || raw === '' ? 'Uncategorized' : String(raw)
    }
    if (!groups[groupName]) groups[groupName] = { rows: [], subtotal: 0 }
    groups[groupName].rows.push(row)
    if (calculateSubtotal) groups[groupName].subtotal += calculateSubtotal(row)
  })

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(defaultCollapsedGroups))
  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // ── Which row (if any) is open in the edit/create sheet. `'new'` is a
  // sentinel for "creating," distinct from any real row id. ─────────────
  const [openRow, setOpenRow] = useState<T | 'new' | null>(null)
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<T | null>(null)

  return (
    <div className="space-y-4">
      {onCreateRow && (
        <button
          type="button"
          onClick={() => setOpenRow('new')}
          className="btn-primary w-full justify-center"
        >
          <Plus size={16} /> {addLabel}
        </button>
      )}

      {Object.entries(groups).map(([groupName, group]) => {
        const collapsed = groupByKey ? collapsedGroups.has(groupName) : false
        return (
          <div key={groupName} className="card overflow-hidden">
            {groupByKey && (
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-left"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0 text-sm font-medium text-slate-800">
                  <ChevronRight size={14} className={`text-slate-400 transition-transform shrink-0 ${collapsed ? '' : 'rotate-90'}`} />
                  <span className="truncate">{renderGroupHeader ? renderGroupHeader(groupName, group.rows) : groupName}</span>
                </span>
                {calculateSubtotal && (
                  <span className="shrink-0 text-xs font-mono font-semibold text-slate-600">{formatRp(group.subtotal)}</span>
                )}
              </button>
            )}
            {!collapsed && (
              <div className="divide-y divide-slate-100">
                {group.rows.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setOpenRow(row)}
                    className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {cardColumns.map((col, idx) => {
                        const value = row[col.key]
                        const rendered = col.format ? col.format(value, row) : String(value ?? '—')
                        // First column reads as the card's own small id/
                        // label line (e.g. Kas Bon ID) — everything else
                        // (except the last, handled separately below) is a
                        // compact label:value line. Mirrors how a receipt
                        // lists a reference number up top, details in the
                        // middle, and the amount at the bottom.
                        if (idx === 0) {
                          return <div key={String(col.key) + idx} className="text-xs text-slate-400 font-mono">{rendered}</div>
                        }
                        if (idx === cardColumns.length - 1) return null
                        return (
                          <div key={String(col.key) + idx} className="flex items-baseline gap-1.5 text-sm">
                            <span className="text-slate-400 text-xs shrink-0">{col.header}:</span>
                            <span className="text-slate-700 truncate">{rendered}</span>
                          </div>
                        )
                      })}
                    </div>
                    {cardColumns.length > 0 && (
                      <div className="shrink-0 text-right">
                        {cardColumns[cardColumns.length - 1].format
                          ? cardColumns[cardColumns.length - 1].format!(row[cardColumns[cardColumns.length - 1].key], row)
                          : String(row[cardColumns[cardColumns.length - 1].key])}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {data.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-10">Nothing here yet{onCreateRow ? ' — tap Add Entry to start.' : '.'}</p>
      )}

      {openRow !== null && (
        <EntrySheet<T>
          row={openRow === 'new' ? null : openRow}
          columns={editableColumns}
          required={required}
          emptyRowTemplate={emptyRowTemplate}
          addLabel={addLabel}
          keyColumn={keyColumn}
          onCreateRow={onCreateRow}
          onUpdateRow={onUpdateRow}
          onRequestDelete={onDeleteRow ? (row) => setConfirmDeleteRow(row) : undefined}
          onClose={() => setOpenRow(null)}
        />
      )}

      {confirmDeleteRow && (
        <ConfirmDialog
          message="Delete this entry?"
          onConfirm={() => {
            onDeleteRow?.(String(confirmDeleteRow[keyColumn]))
            setConfirmDeleteRow(null)
            setOpenRow(null)
          }}
          onCancel={() => setConfirmDeleteRow(null)}
        />
      )}
    </div>
  )
}

// ─── The create/edit form itself, shown in a Modal ──────────────────────────
function EntrySheet<T extends { id: string | number }>({
  row, columns, required, emptyRowTemplate, addLabel, keyColumn, onCreateRow, onUpdateRow, onRequestDelete, onClose,
}: {
  row: T | null
  columns: ColumnDef<T>[]
  required: (keyof T)[]
  emptyRowTemplate?: () => Partial<T>
  addLabel: string
  keyColumn: keyof T
  onCreateRow?: (row: Partial<T>) => void | Promise<boolean>
  onUpdateRow: (id: string, updatedRow: T) => void
  onRequestDelete?: (row: T) => void
  onClose: () => void
}) {
  const isNew = row === null
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...(isNew && emptyRowTemplate ? emptyRowTemplate() : {}),
    ...(row ?? {}),
  }))
  const [submitting, setSubmitting] = useState(false)

  const setField = (key: keyof T, value: unknown) => setDraft(prev => ({ ...prev, [key]: value }))
  const isFilled = (key: keyof T) => draft[key as string] !== '' && draft[key as string] != null
  const canSubmit = required.every(isFilled)

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    if (isNew) {
      setSubmitting(true)
      try {
        const result = onCreateRow?.(draft as Partial<T>)
        if (result && typeof (result as Promise<boolean>).then === 'function') {
          const ok = await (result as Promise<boolean>)
          // false = the caller cancelled a confirmation step (e.g. backed
          // out of the "new Kas Bon needs a date" prompt) — same as
          // SpreadsheetView's own restore path, leave the form open with
          // what was typed still there instead of discarding it.
          if (ok === false) { setSubmitting(false); return }
        }
        setSubmitting(false)
        onClose()
      } catch {
        setSubmitting(false)
      }
    } else {
      onUpdateRow(String(row![keyColumn]), { ...row, ...draft } as T)
      onClose()
    }
  }

  return (
    <Modal title={isNew ? addLabel : 'Edit Entry'} onClose={onClose} size="sm">
      <div className="space-y-4">
        {columns.map(col => (
          <FormField key={String(col.key)} label={col.header} required={required.includes(col.key)}>
            <EntryField
              col={col}
              value={draft[col.key as string]}
              onChange={v => setField(col.key, v)}
            />
          </FormField>
        ))}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1 justify-center" disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : isNew ? <Plus size={14} /> : null}
            {submitting ? 'Saving…' : isNew ? addLabel : 'Save'}
          </button>
          {!isNew && onRequestDelete && (
            <button
              type="button"
              className="btn-secondary !px-3 hover:!text-red-600 hover:!border-red-200"
              title="Delete"
              onClick={() => onRequestDelete(row!)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// One field, typed off the same ColumnDef the desktop grid's EditableCell
// reads — text/uppercase/suggestions, number/allowDecimal, select, date all
// behave the same as they do there, just as a normal form field instead of
// an inline table cell.
function EntryField<T>({ col, value, onChange }: {
  col: ColumnDef<T>
  value: unknown
  onChange: (value: unknown) => void
}) {
  const datalistId = `mobile-suggest-${String(col.key)}`

  if (col.type === 'select') {
    return (
      <select className="field" value={(value as string | number) ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  if (col.type === 'date') {
    return (
      <input
        className="field"
        type="date"
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (col.type === 'number') {
    return (
      <input
        className="field font-mono"
        type="text"
        inputMode={col.allowDecimal ? 'decimal' : 'numeric'}
        placeholder={col.placeholder}
        value={value === '' || value == null ? '' : String(value)}
        onChange={e => {
          let cleaned = e.target.value.replace(col.allowDecimal ? /[^\d.]/g : /[^\d]/g, '')
          if (col.allowDecimal) {
            const firstDot = cleaned.indexOf('.')
            if (firstDot !== -1) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
          }
          onChange(cleaned)
        }}
      />
    )
  }

  // text — uppercase transform + suggestions both layer onto the same
  // UppercaseField used everywhere else in the app when col.uppercase is
  // set, so caret behavior matches every other uppercase field; plain
  // .field input otherwise.
  if (col.uppercase) {
    return (
      <>
        <UppercaseField
          className="field"
          placeholder={col.placeholder}
          value={(value as string) ?? ''}
          onChange={onChange}
          list={col.suggestions?.length ? datalistId : undefined}
        />
        {col.suggestions && col.suggestions.length > 0 && (
          <datalist id={datalistId}>
            {col.suggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </>
    )
  }

  return (
    <>
      <input
        className="field"
        type="text"
        placeholder={col.placeholder}
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        list={col.suggestions?.length ? datalistId : undefined}
      />
      {col.suggestions && col.suggestions.length > 0 && (
        <datalist id={datalistId}>
          {col.suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
    </>
  )
}
