import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { formatRp } from './index' // Assuming formatRp is exported from your ui/index.ts
import { EditableCell } from './EditableCell'

interface SelectOption {
  value: string | number
  label: string
}

interface ColumnDef<T> {
  key: keyof T
  header: string
  type: 'text' | 'number' | 'select'
  editable?: boolean
  options?: SelectOption[]
  format?: (val: any, row: T) => React.ReactNode
  width?: string
  placeholder?: string
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
  /** Called once the trigger column of a blank row is filled in — creates the row server-side. */
  onCreateRow?: (row: Partial<T>) => void
  /** If provided, the keyColumn is auto-assigned from this at the moment a blank row is committed, instead of being typed by hand. */
  getNextId?: () => string
  /** Extra empty rows kept at the bottom, ready to type into, à la Excel/Sheets. */
  minBlankRows?: number
  /** Defaults merged into every new blank row (e.g. si_unit: 'yard'). Don't put keyColumn's value here if getNextId is set. */
  emptyRowTemplate?: () => Partial<T>
  /** Scroll container height so the sheet stays put while the page around it scrolls. */
  maxHeight?: string
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
  getNextId,
  minBlankRows = 3,
  emptyRowTemplate,
  maxHeight = '70vh',
}: SpreadsheetViewProps<T>) {
  const trigger = triggerColumn ?? keyColumn
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
      if (row && field === trigger && value !== '' && value != null) {
        const { __key, ...payload } = row
        if (getNextId) (payload as any)[keyColumn as string] = getNextId()
        onCreateRow?.(payload as Partial<T>)
        return prev.filter(r => r.__key !== rowKey)
      }
      return next
    })
  }

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

  return (
    <div
      className="w-full overflow-auto bg-white rounded-lg shadow border border-slate-200"
      style={{ maxHeight }}
    >
      <table className="w-full text-sm text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            {columns.map(col => (
              <th
                key={String(col.key)}
                style={col.width ? { width: col.width } : undefined}
                className="px-4 py-3 font-semibold text-slate-600 border-r border-slate-200 last:border-0 bg-slate-50 whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
            {onDeleteRow && <th className="w-10 bg-slate-50" />}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedData).map(([groupName, group]) => (
            <React.Fragment key={groupName}>
              {groupByKey && (
                <tr className="bg-slate-100/50 border-b border-slate-200">
                  <td colSpan={colCount} className="px-4 py-2 font-medium text-slate-800">
                    {groupName}
                  </td>
                </tr>
              )}

              {group.rows.map(row => (
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
                          format={val => (col.format ? col.format(val, row) : val)}
                          onSave={(newVal) => onUpdateRow(String(row.id), { ...row, [col.key]: newVal })}
                        />
                      ) : (
                        <div className="px-2 py-1">
                          {col.format ? col.format(row[col.key], row) : String(row[col.key])}
                        </div>
                      )}
                    </td>
                  ))}
                  {onDeleteRow && (
                    <td className="px-2 text-center">
                      <button
                        onClick={() => onDeleteRow(String(row.id))}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                        title="Delete row"
                      >
                        <Trash2 size={14} />
                      </button>
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
          ))}

          {/* Blank rows — type into any cell to spin up a new record. The key column commits it. */}
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
                      format={val => (col.format ? col.format(val, row as unknown as T) : val)}
                      onSave={(newVal) => updateBlankField(row.__key, col.key, newVal)}
                    />
                  ) : (
                    <div className="px-2 py-1">
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
        </tbody>
      </table>
    </div>
  )
}