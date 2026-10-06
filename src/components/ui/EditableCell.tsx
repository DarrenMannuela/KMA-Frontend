import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'

interface SelectOption {
  value: string | number
  label: string
}

interface EditableCellProps {
  value: any
  type?: 'text' | 'number' | 'select' | 'date'
  options?: SelectOption[]
  onSave: (val: any) => void
  format?: (val: any) => React.ReactNode
  placeholder?: string
  /** Suggestions shown in a <datalist> (type="text" only); new values are still allowed. */
  suggestions?: string[]
  /** Allow a single decimal point while typing (e.g. quantities like "2.5
   *  meter"). Digits-only stays the default for whole-number fields. */
  allowDecimal?: boolean
  /** Force text input to uppercase as it's typed — for alphanumeric IDs
   *  (e.g. Kas Bon IDs) where "01/kb/26" and "01/KB/26" should read as the
   *  same value rather than silently diverging. Only applies to type="text". */
  uppercase?: boolean
  /** Registers the cell's focusable node (display div or input) for arrow-key navigation. */
  cellRef?: (el: HTMLElement | null) => void
  /** Called to move focus to a neighboring cell: (rowDelta, colDelta), e.g.
   *  (0, 1) for "one cell right". SpreadsheetView owns the actual grid and
   *  resolves this into a .focus() call on the target cell. */
  onNavigate?: (rowDelta: number, colDelta: number) => void
}

export function EditableCell({
  value: initialValue,
  type = 'text',
  options,
  onSave,
  format,
  placeholder,
  suggestions,
  allowDecimal = false,
  uppercase = false,
  cellRef,
  onNavigate,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(initialValue)
  // `T | null` keeps .current assignable, which the cellRef callbacks below need.
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const datalistId = useId()
  // Restores the caret after each change: a controlled input otherwise jumps it
  // to the end when typing in the middle of the text.
  const caretPos = useRef<number | null>(null)

  useEffect(() => { setVal(initialValue) }, [initialValue])

  useEffect(() => {
    if (!isEditing) return
    if (type === 'select') selectRef.current?.focus()
    else {
      inputRef.current?.focus()
      if (!seeded.current) inputRef.current?.select()
    }
  }, [isEditing, type])

  useLayoutEffect(() => {
    if (isEditing && type !== 'select' && caretPos.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(caretPos.current, caretPos.current)
    }
  }, [val, isEditing, type])

  // One edit saves once: Enter commits, and the blur that follows when the
  // input goes away must not save the same edit a second time.
  const committed = useRef(false)
  // Entering edit by click/Enter/F2 selects the text so typing replaces it,
  // like a spreadsheet; entering by typing starts from that keystroke.
  const seeded = useRef(false)
  const startEditing = (seed?: string) => {
    committed.current = false
    seeded.current = seed !== undefined
    if (seed !== undefined) setVal(seed)
    setIsEditing(true)
  }

  const commit = (raw: any) => {
    if (committed.current) return
    committed.current = true
    setIsEditing(false)
    // A <select> returns strings; use the matching option's own value so numeric
    // fields (supplier_id) stay numbers.
    let value = raw
    if (type === 'number') {
      value = Number(raw)
    } else if (type === 'select' && options) {
      const matched = options.find(o => String(o.value) === String(raw))
      if (matched) value = matched.value
    }
    if (value !== initialValue && !(value === '' && (initialValue === null || initialValue === undefined))) {
      onSave(value)
    }
  }

  // Numbers are typed in a text input (with a numeric keyboard) and filtered:
  // digits only, plus one "." when allowDecimal (2.5 meters).
  const handleChange = (raw: string, caret: number | null) => {
    if (type !== 'number') {
      caretPos.current = caret
      setVal(uppercase ? raw.toUpperCase() : raw)
      return
    }
    let cleaned = raw.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, '')
    if (allowDecimal) {
      const firstDot = cleaned.indexOf('.')
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
      }
    }
    setVal(cleaned)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Commit-then-move-down mirrors Excel: Enter confirms the cell and
      // advances to the next row, same column (Shift+Enter goes up
      // instead) rather than just sitting in place.
      e.preventDefault()
      commit(val)
      onNavigate?.(e.shiftKey ? -1 : 1, 0)
      return
    }
    if (e.key === 'Escape') {
      committed.current = true
      setVal(initialValue)
      setIsEditing(false)
      return
    }
    // Up/Down commit and move, like Enter. Left/Right keep moving the caret while
    // editing; a <select> keeps its own Up/Down.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && type !== 'select') {
      e.preventDefault()
      commit(val)
      onNavigate?.(e.key === 'ArrowUp' ? -1 : 1, 0)
    }
  }

  // Fires on the non-editing display div — i.e. only when this cell is
  // focused but NOT currently being typed into.
  const handleDisplayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); onNavigate?.(-1, 0); return
      case 'ArrowDown':  e.preventDefault(); onNavigate?.(1, 0); return
      case 'ArrowLeft':  e.preventDefault(); onNavigate?.(0, -1); return
      case 'ArrowRight': e.preventDefault(); onNavigate?.(0, 1); return
      case 'Enter':
      case 'F2':
        e.preventDefault(); startEditing(); return
    }
    // Typing on a selected cell starts editing with that keystroke, like Excel
    // (text and number cells).
    if ((type === 'text' || type === 'number') && e.key.length === 1) {
      let first = e.key
      if (type === 'number') {
        first = first.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, '')
        if (!first) return // first keystroke wasn't a usable digit — ignore, don't open edit mode on nothing
      } else if (uppercase) {
        first = first.toUpperCase()
      }
      e.preventDefault()
      startEditing(first)
    }
  }

  if (isEditing) {
    if (type === 'select') {
      return (
        <select
          ref={(el) => { selectRef.current = el; cellRef?.(el) }}
          value={val ?? ''}
          onChange={(e) => setVal(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border-2 border-navy-400 rounded outline-none bg-white"
        >
          <option value="">Select…</option>
          {options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }

    return (
      <>
        <input
          ref={(el) => { inputRef.current = el; cellRef?.(el) }}
          type={type === 'number' ? 'text' : type}
          inputMode={type === 'number' ? (allowDecimal ? 'decimal' : 'numeric') : undefined}
          value={val ?? ''}
          // Date inputs don't support the selection API.
          onChange={(e) => handleChange(e.target.value, type === 'date' ? null : e.target.selectionStart)}
          onBlur={() => commit(val)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          list={suggestions && suggestions.length > 0 ? datalistId : undefined}
          className="w-full px-2 py-1 text-sm border-2 border-navy-400 rounded outline-none bg-white"
        />
        {suggestions && suggestions.length > 0 && (
          <datalist id={datalistId}>
            {suggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </>
    )
  }

  const isEmpty = initialValue === '' || initialValue === null || initialValue === undefined

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onClick={() => startEditing()}
      onKeyDown={handleDisplayKeyDown}
      // The dotted underline marks the cell editable on touch screens, where hover
      // doesn't exist; the focus border marks the active cell.
      className="px-2 py-1 min-h-[1.75rem] cursor-cell border border-transparent border-b-slate-200 [border-bottom-style:dotted] hover:border-slate-300 hover:bg-slate-50 hover:[border-bottom-style:solid] focus:outline-none focus:border-navy-400 focus:bg-navy-50/50 focus:[border-bottom-style:solid] transition-colors break-words"
    >
      {isEmpty
        ? <span className="text-slate-300 italic">{placeholder ?? 'click to fill'}</span>
        : (format ? format(initialValue) : initialValue)}
    </div>
  )
}