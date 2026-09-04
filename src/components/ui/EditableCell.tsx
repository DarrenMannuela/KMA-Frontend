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
  /** Optional free-text suggestions (e.g. existing Kas Bon IDs) shown via a
   *  native <datalist> — still lets people type a brand-new value, just
   *  reduces accidental near-duplicate IDs from typos. Only applies to
   *  type="text". */
  suggestions?: string[]
  /** Allow a single decimal point while typing (e.g. quantities like "2.5
   *  meter"). Digits-only stays the default for whole-number fields. */
  allowDecimal?: boolean
  /** Force text input to uppercase as it's typed — for alphanumeric IDs
   *  (e.g. Kas Bon IDs) where "01/kb/26" and "01/KB/26" should read as the
   *  same value rather than silently diverging. Only applies to type="text". */
  uppercase?: boolean
  /** Registers this cell's focusable DOM node with SpreadsheetView's grid-
   *  navigation map, so arrow keys pressed elsewhere in the sheet can call
   *  .focus() on it directly. Fires for whichever element is currently
   *  rendered — the display div or the input/select — since React swaps
   *  one for the other on every edit-mode toggle. */
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
  // Typed as `T | null` (not just `T`) so these come back as mutable refs —
  // `useRef<T>(null)` alone types `.current` readonly in current React
  // types (meant for handing straight to JSX's `ref` prop only), which is
  // exactly what broke the manual `selectRef.current = el` assignment
  // below once cellRef needed to also observe the same node.
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const datalistId = useId()
  // React re-sets a controlled input's DOM value on every keystroke, which
  // resets the caret to the end of the string unless something restores
  // it — normally invisible since typing at the end IS where the caret
  // already is, but obvious the moment you click into the middle of
  // existing text: type one character and the caret jumps back to the
  // end. Most noticeable on uppercase fields (the transform touches the
  // string every time), but it's a general controlled-input issue, not an
  // uppercase-only one, so this restores position after every change.
  const caretPos = useRef<number | null>(null)

  useEffect(() => { setVal(initialValue) }, [initialValue])

  useEffect(() => {
    if (!isEditing) return
    if (type === 'select') selectRef.current?.focus()
    else inputRef.current?.focus()
  }, [isEditing, type])

  useLayoutEffect(() => {
    if (isEditing && type !== 'select' && caretPos.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(caretPos.current, caretPos.current)
    }
  }, [val, isEditing, type])

  const commit = (raw: any) => {
    setIsEditing(false)
    // A native <select> always hands back a string in e.target.value, even
    // when the field it represents is numeric (e.g. supplier_id/client_id).
    // Match back to the option whose value stringifies to the same thing,
    // and use ITS value — preserving whatever type it actually is — so a
    // number-typed field doesn't silently turn into a string ("3" instead
    // of 3) and get rejected by a backend expecting a real number.
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

  // Native <input type="number"> still lets people type/paste "e", "+", "-"
  // (valid characters for JS number parsing, not valid for a price or qty).
  // Rendering it as text + inputMode="numeric" and filtering here closes
  // that off while keeping the numeric keyboard on mobile. allowDecimal
  // permits a single "." for fields like quantity (2.5 meter of fabric is
  // a normal real-world entry) while still blocking a second dot.
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
      setVal(initialValue)
      setIsEditing(false)
      return
    }
    // Up/Down commit-and-move too, same as Enter — a single-line input has
    // no native use for vertical arrows anyway. Left/Right are deliberately
    // left alone here so they keep moving the caret within the text being
    // typed, exactly like Excel: arrows only jump cells once you're NOT
    // actively editing. select is excluded because its native Up/Down
    // already means something (cycle the highlighted option) and
    // hijacking that would fight the browser rather than help.
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
        e.preventDefault(); setIsEditing(true); return
    }
    // "Just start typing" — the classic Excel shortcut: a printable
    // keystroke on a selected-but-not-editing cell opens it for editing
    // with that character already entered, instead of requiring
    // Enter/click first. Limited to text/number — select's options aren't
    // something a single keystroke can meaningfully seed, and date's
    // native picker doesn't take free text either.
    if ((type === 'text' || type === 'number') && e.key.length === 1) {
      let seeded = e.key
      if (type === 'number') {
        seeded = seeded.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, '')
        if (!seeded) return // first keystroke wasn't a usable digit — ignore, don't open edit mode on nothing
      } else if (uppercase) {
        seeded = seeded.toUpperCase()
      }
      e.preventDefault()
      setVal(seeded)
      setIsEditing(true)
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
          className="w-full px-2 py-1 text-sm border-2 border-blue-500 rounded outline-none bg-white"
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
          // input[type=date] (like range/color/checkbox) doesn't support the
          // selection API — reading .selectionStart on it throws
          // ("does not support selection") the moment a date is picked, so
          // this is skipped for date fields; there's no meaningful caret to
          // preserve on a native date picker anyway.
          onChange={(e) => handleChange(e.target.value, type === 'date' ? null : e.target.selectionStart)}
          onBlur={() => commit(val)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          list={suggestions && suggestions.length > 0 ? datalistId : undefined}
          className="w-full px-2 py-1 text-sm border-2 border-blue-500 rounded outline-none bg-white"
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
      onClick={() => setIsEditing(true)}
      onKeyDown={handleDisplayKeyDown}
      // The dotted underline is a permanent editability affordance — hover
      // states (border/bg) don't exist on touch devices, so without this a
      // cell gives no visual hint it's clickable until the first accidental
      // tap teaches the pattern. Hover styling stays as a bonus for mouse users.
      // focus: styling is the active-cell indicator for keyboard navigation
      // — reuses the same border rather than a box-shadow ring so it reads
      // as a natural extension of the existing hover/underline treatment.
      className="px-2 py-1 min-h-[1.75rem] cursor-cell border border-transparent border-b-slate-200 [border-bottom-style:dotted] hover:border-slate-300 hover:bg-slate-50 hover:[border-bottom-style:solid] focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:[border-bottom-style:solid] transition-colors break-words"
    >
      {isEmpty
        ? <span className="text-slate-300 italic">{placeholder ?? 'click to fill'}</span>
        : (format ? format(initialValue) : initialValue)}
    </div>
  )
}