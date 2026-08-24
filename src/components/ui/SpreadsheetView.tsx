import React, { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { Trash2, ChevronRight, Plus, Check, X } from 'lucide-react'
import { formatRp } from './index' // Assuming formatRp is exported from your ui/index.ts
import { EditableCell } from './EditableCell'

interface SelectOption {
  value: string | number
  label: string
}

export interface ColumnDef<T> {
  key: keyof T
  header: string
  type: 'text' | 'number' | 'select' | 'date'
  editable?: boolean
  options?: SelectOption[]
  format?: (val: any, row: T) => React.ReactNode
  width?: string
  placeholder?: string
  /** Allow one decimal point while typing (e.g. quantities like "2.5 meter"). Only relevant for type="number". */
  allowDecimal?: boolean
  /** Free-text autocomplete suggestions (e.g. existing Kas Bon IDs) — cuts down on
   *  accidental near-duplicate IDs from typos, while still allowing new values. */
  suggestions?: string[]
  /** Force text input to uppercase as it's typed (e.g. Kas Bon IDs). Only relevant for type="text". */
  uppercase?: boolean
}

interface SpreadsheetViewProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  groupByKey?: keyof T | ((row: T) => string)
  calculateSubtotal?: (row: T) => number
  onUpdateRow: (id: string, updatedRow: T) => void
  onDeleteRow?: (id: string) => void

  /** The primary-key column. Never rendered editable — either shown as-is, or auto-assigned via getNextId. Defaults to 'id'. */
  keyColumn?: keyof T
  /** The column whose edit triggers creation of a blank row. Defaults to keyColumn. */
  triggerColumn?: keyof T
  /** Called once every column in requiredColumns is filled in on a blank row — creates the row
   *  server-side. Normally returns void: the row is discarded immediately (optimistic). If the
   *  create needs a confirmation step first (e.g. a modal), return a Promise<boolean> instead —
   *  resolving `false` restores the row's typed data rather than discarding it (`true`/no
   *  explicit false behaves the same as void). */
  onCreateRow?: (row: Partial<T>) => void | Promise<boolean>
  /** Columns that must ALL be non-empty before a blank row is submitted via onCreateRow.
   *  Defaults to [triggerColumn ?? keyColumn], preserving the original single-field behavior.
   *  Set this to e.g. [triggerColumn, 'price'] to keep a row staged in the "New entries" buffer
   *  until every required field is filled, instead of submitting the instant the first one is. */
  requiredColumns?: (keyof T)[]
  /** If provided, the keyColumn is auto-assigned from this at the moment a blank row is committed, instead of being typed by hand. */
  getNextId?: () => string
  /** Blank rows kept ready to type into. Defaults to 1 — the buffer tops back up to this after each row graduates into real data; use the "+ Add another row" button for more at once. */
  minBlankRows?: number
  /** Defaults merged into every new blank row (e.g. si_unit: 'yard'). Don't put keyColumn's value here if getNextId is set. */
  emptyRowTemplate?: () => Partial<T>
  /** Scroll container height so the sheet stays put while the page around it scrolls. */
  maxHeight?: string
  /** Groups collapsed by default (matched against the group name). Groups still start expanded unless listed here. */
  defaultCollapsedGroups?: string[]
  /** Customizes the group header row content (e.g. showing shared header-level
   *  fields like date/description when grouping by Kas Bon ID). Falls back to
   *  the plain group name if not provided. */
  renderGroupHeader?: (groupName: string, rows: T[]) => React.ReactNode
}

let blankSeq = 0
function newBlankKey() {
  blankSeq += 1
  return `__blank_${blankSeq}_${Date.now()}`
}

export function SpreadsheetView<T extends { id: string | number }>({
  data = [],
  columns,
  groupByKey,
  calculateSubtotal,
  onUpdateRow,
  onDeleteRow,
  keyColumn = 'id' as keyof T,
  triggerColumn,
  onCreateRow,
  requiredColumns,
  getNextId,
  minBlankRows = 1,
  emptyRowTemplate,
  maxHeight = '70vh',
  defaultCollapsedGroups = [],
  renderGroupHeader,
}: SpreadsheetViewProps<T>) {
  const trigger = triggerColumn ?? keyColumn
  const required = requiredColumns ?? [trigger]
  const makeBlankRows = useCallback((n: number) => (
    Array.from({ length: n }, () => ({
      __key: newBlankKey(),
      ...(emptyRowTemplate ? emptyRowTemplate() : {}),
    }))
  ), [emptyRowTemplate])

  const [blankRows, setBlankRows] = useState<(Record<string, any> & { __key: string })[]>(
    () => (onCreateRow ? makeBlankRows(minBlankRows) : [])
  )

  // Keep the blank-row buffer topped up as rows graduate into real data.
  useEffect(() => {
    if (!onCreateRow) return
    if (blankRows.length < minBlankRows) {
      setBlankRows(prev => [...prev, ...makeBlankRows(minBlankRows - prev.length)])
    }
  }, [blankRows.length, minBlankRows, onCreateRow, makeBlankRows])

  const updateBlankField = (rowKey: string, field: keyof T, value: any) => {
    setBlankRows(prev => {
      const next = prev.map(r => (r.__key === rowKey ? { ...r, [field]: value } : r))
      const row = next.find(r => r.__key === rowKey)
      const isFilled = (col: keyof T) => row![col as string] !== '' && row![col as string] != null
      // Only submit once every required column has a value — not just the trigger column —
      // so a row stays staged in "New entries" until it's actually complete instead of
      // graduating into the main table half-filled (e.g. Price still at its Rp 0 default).
      if (row && required.every(isFilled)) {
        const { __key, ...payload } = row
        if (getNextId) (payload as any)[keyColumn as string] = getNextId()
        const result = onCreateRow?.(payload as Partial<T>)
        // If onCreateRow deferred its decision (e.g. it's waiting on a
        // confirmation modal) and that decision comes back as "cancelled",
        // put the row back so whatever was typed isn't silently lost.
        if (result && typeof (result as Promise<boolean>).then === 'function') {
          (result as Promise<boolean>).then(shouldKeepGoing => {
            if (shouldKeepGoing === false) {
              setBlankRows(cur => [...cur, row])
            }
          })
        }
        return prev.filter(r => r.__key !== rowKey)
      }
      return next
    })
  }

  const addBlankRow = () => setBlankRows(prev => [...prev, ...makeBlankRows(1)])

  // ── Delete confirmation ─────────────────────────────────────────────────
  // A bare trash icon that fires immediately is one misclick away from
  // losing a row — worse here, since deleting the last item on a Kas Bon
  // can cascade-delete the whole shared header (see productionHooks/
  // operationHooks useDelete). First click arms a row (shows check/cancel
  // in place of the trash icon); a second, deliberate click actually
  // deletes. Arming a different row disarms the previous one.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const requestDelete = (id: string) => setPendingDeleteId(id)
  const cancelDelete = () => setPendingDeleteId(null)
  const confirmDelete = (id: string) => {
    onDeleteRow?.(id)
    setPendingDeleteId(null)
  }

  // ── Collapsible groups ──────────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(defaultCollapsedGroups))
  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // ── Sticky group headers: measure the real header height so group rows can
  // stick right underneath it instead of a guessed pixel value. ──────────
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [headerHeight, setHeaderHeight] = useState(44)
  useLayoutEffect(() => {
    if (theadRef.current) setHeaderHeight(theadRef.current.getBoundingClientRect().height)
  }, [columns])

  const groupedData = useMemo(() => {
    const groups: Record<string, { rows: T[]; subtotal: number }> = {}
    const defaultGroup = 'All Records'

    data.forEach(row => {
      let groupName = defaultGroup
      if (typeof groupByKey === 'function') {
        groupName = groupByKey(row)
      } else if (groupByKey) {
        groupName = String(row[groupByKey] || 'Uncategorized')
      }

      if (!groups[groupName]) groups[groupName] = { rows: [], subtotal: 0 }
      groups[groupName].rows.push(row)
      if (calculateSubtotal) groups[groupName].subtotal += calculateSubtotal(row)
    })

    return groups
  }, [data, groupByKey, calculateSubtotal])

  const colCount = columns.length + (onDeleteRow ? 1 : 0)

  // Jump to the bottom on first load, once real data has actually rendered —
  // that's normally where people are working (most recent entries, or the
  // "new entries" footer right below), so no one has to scroll down by hand
  // every time they open the sheet.
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasAutoScrolled = useRef(false)
  useEffect(() => {
    if (hasAutoScrolled.current) return
    if (!scrollRef.current) return
    if (data.length === 0) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    hasAutoScrolled.current = true
  }, [data])

  // Shared column widths so the scrollable data table and the pinned
  // "new entries" table below it stay pixel-aligned regardless of their
  // (different) cell content — table-layout: fixed + an identical colgroup
  // in both tables is what actually guarantees that, not content sizing.
  const colGroup = (
    <colgroup>
      {columns.map((c, idx) => <col key={idx} style={c.width ? { width: c.width } : undefined} />)}
      {onDeleteRow && <col style={{ width: '2.5rem' }} />}
    </colgroup>
  )

  return (
    <div
      className="w-full overflow-x-auto bg-white rounded-lg shadow border border-slate-200 flex flex-col"
      style={{ maxHeight }}
    >
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0">
        <table className="w-full text-sm text-left border-collapse" style={{ tableLayout: 'fixed' }}>
          {colGroup}
          <thead ref={theadRef} className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 font-semibold text-slate-600 border-r border-slate-200 last:border-0 bg-slate-50 whitespace-nowrap"
                >
                  {col.header}
                </th>
              ))}
              {onDeleteRow && <th className="w-10 bg-slate-50" />}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedData).map(([groupName, group]) => {
              const collapsed = groupByKey ? collapsedGroups.has(groupName) : false
              return (
                <React.Fragment key={groupName}>
                  {groupByKey && (
                    <tr
                      className="bg-slate-100/95 border-b border-slate-200 sticky z-10"
                      style={{ top: headerHeight }}
                    >
                      <td
                        colSpan={colCount}
                        onClick={() => toggleGroup(groupName)}
                        className="px-4 py-2 font-medium text-slate-800 cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight
                            size={14}
                            className={`text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                          />
                          {renderGroupHeader ? renderGroupHeader(groupName, group.rows) : groupName}
                          <span className="text-slate-400 font-normal text-xs">({group.rows.length})</span>
                        </span>
                      </td>
                    </tr>
                  )}

                  {!collapsed && group.rows.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                      {columns.map((col, idx) => (
                        <td
                          key={`${row.id}-${String(col.key)}-${idx}`}
                          className="px-2 py-1 border-r border-slate-100 last:border-0 align-middle"
                        >
                          {col.editable ? (
                            <EditableCell
                              value={row[col.key]}
                              type={col.type}
                              options={col.options}
                              placeholder={col.placeholder}
                              suggestions={col.suggestions}
                              allowDecimal={col.allowDecimal}
                              uppercase={col.uppercase}
                              format={val => (col.format ? col.format(val, row) : val)}
                              onSave={(newVal) => onUpdateRow(String(row.id), { ...row, [col.key]: newVal })}
                            />
                          ) : (
                            <div className="px-2 py-1 break-words">
                              {col.format ? col.format(row[col.key], row) : String(row[col.key])}
                            </div>
                          )}
                        </td>
                      ))}
                      {onDeleteRow && (
                        <td className="px-2 text-center">
                          {pendingDeleteId === String(row.id) ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => confirmDelete(String(row.id))}
                                className="text-red-500 hover:text-red-700"
                                title="Confirm delete"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={cancelDelete}
                                className="text-slate-400 hover:text-slate-600"
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => requestDelete(String(row.id))}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                              title="Delete row"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}

                  {calculateSubtotal && (
                    <tr className="bg-blue-50/30 border-b border-slate-200">
                      <td colSpan={columns.length - 1} className="px-4 py-2 text-right font-medium text-slate-600">
                        Subtotal for {groupName}:
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-800">
                        {formatRp(group.subtotal)}
                      </td>
                      {onDeleteRow && <td />}
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* "New entries" is pinned outside the scroll area — always visible,
          never requires scrolling down to find, and its own table shares
          colGroup with the one above so columns still line up. */}
      {onCreateRow && (
        <div className="shrink-0 border-t border-slate-200">
          <table className="w-full text-sm text-left border-collapse" style={{ tableLayout: 'fixed' }}>
            {colGroup}
            <tbody>
              {blankRows.length > 0 && (
                <tr className="bg-slate-50/40 border-b border-slate-200">
                  <td colSpan={colCount} className="px-4 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide">
                    New entries — start typing
                  </td>
                </tr>
              )}
              {blankRows.map(row => (
                <tr key={row.__key} className="border-b border-slate-100 bg-white">
                  {columns.map((col, idx) => (
                    <td
                      key={`${row.__key}-${String(col.key)}-${idx}`}
                      className="px-2 py-1 border-r border-slate-100 last:border-0 align-middle"
                    >
                      {col.key === keyColumn && getNextId ? (
                        <div className="px-2 py-1 text-slate-400 font-mono text-xs italic">
                          auto — {getNextId()}
                        </div>
                      ) : col.editable ? (
                        <EditableCell
                          value={row[col.key as string] ?? ''}
                          type={col.type}
                          options={col.options}
                          placeholder={col.key === keyColumn ? (col.placeholder ?? 'new ID…') : col.placeholder}
                          suggestions={col.suggestions}
                          allowDecimal={col.allowDecimal}
                          uppercase={col.uppercase}
                          format={val => (col.format ? col.format(val, row as unknown as T) : val)}
                          onSave={(newVal) => updateBlankField(row.__key, col.key, newVal)}
                        />
                      ) : (
                        <div className="px-2 py-1 break-words">
                          {col.format
                            ? col.format(row[col.key as string], row as unknown as T)
                            : <span className="text-slate-300">—</span>}
                        </div>
                      )}
                    </td>
                  ))}
                  {onDeleteRow && <td />}
                </tr>
              ))}

              <tr>
                <td colSpan={colCount} className="px-4 py-2">
                  <button
                    onClick={addBlankRow}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-navy-600 transition-colors"
                  >
                    <Plus size={13} /> Add another row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}