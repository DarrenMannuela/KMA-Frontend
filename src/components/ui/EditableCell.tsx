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
  /** Excel-style grid navigation. Called when the cell should hand focus to
   *  a neighboring cell — arrow keys on the non-editing display div, or
   *  Up/Down/Enter while editing (which commit first, then navigate). Not
   *  called for Tab (native focus order already moves to the next
   *  focusable cell) or for Left/Right while editing text/number/date
   *  (default caret movement instead). The grid (SpreadsheetView) owns row/
   *  column position and decides where "up"/"down"/"left"/"right" actually
   *  goes — this component just reports the gesture. */
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void
  /** Registers this cell's focusable display element with the grid so a
   *  neighboring cell's onNavigate can find and focus it. Only the
   *  non-editing div is registered — while a cell is actively being
   *  edited it's rarely also someone else's navigation target, so the
   *  input/select itself isn't wired into the registry. */
  cellRef?: (el: HTMLDivElement | null) => void
}

const NAV_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
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
  onNavigate,
  cellRef,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
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
  // Guards against a double commit. Normally commit() -> setIsEditing(false)
  // is the last thing that happens to a cell: the input unmounts on the
  // next render, so a later blur can't fire commit() again. Grid navigation
  // breaks that assumption — moveFocus() calls .focus() on the *next* cell
  // synchronously, before React has re-rendered this one, which fires this
  // input's onBlur (and therefore commit()) a second time on the same
  // still-mounted input. Tracked as a ref (not state) since it needs to be
  // read/written within the same synchronous event-handling pass.
  const hasCommittedRef = useRef(false)

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

  // Shared entry point for opening a cell for editing — used by the click
  // handler below, by Enter/F2 on a focused display cell, and by the
  // "just start typing" shortcut (which passes the character that was
  // typed so it lands in the field instead of being swallowed by the
  // click-to-focus keystroke). Resets the double-commit guard so a fresh
  // edit session starts clean.
  const beginEditing = (initialChar?: string) => {
    hasCommittedRef.current = false
    if (initialChar !== undefined) {
      const next = uppercase ? initialChar.toUpperCase() : initialChar
      caretPos.current = next.length
      setVal(next)
    }
    setIsEditing(true)
  }

  const commit = (raw: any) => {
    if (hasCommittedRef.current) return
    hasCommittedRef.current = true
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
      // Excel behavior: Enter commits and drops down to the same column on
      // the next row, rather than just closing the cell in place.
      e.preventDefault()
      commit(val)
      onNavigate?.('down')
      return
    }
    if (e.key === 'Escape') {
      setVal(initialValue)
      setIsEditing(false)
      return
    }
    const navDir = NAV_KEYS[e.key]
    if (!navDir) return
    if (navDir === 'up' || navDir === 'down') {
      // Native <input type="date"> uses Up/Down to increment/decrement the
      // focused date segment, and a <select> uses them to change the
      // selected option without opening the dropdown — both are exactly
      // what a person expects while editing that field type, so grid
      // navigation stands aside here rather than hijacking the keys.
      if (type === 'date' || type === 'select') return
      e.preventDefault()
      commit(val)
      onNavigate?.(navDir)
      return
    }
    // Left/Right: a <select> doesn't use these keys for anything, so it's
    // safe to treat them as "commit and move to the neighboring column."
    // Text/number/date all use Left/Right for normal caret movement (a
    // date input moves between its mm/dd/yyyy segments), so those are left
    // alone entirely — intercepting them would break editing mid-value.
    if (type === 'select') {
      e.preventDefault()
      commit(val)
      onNavigate?.(navDir)
    }
  }

  if (isEditing) {
    if (type === 'select') {
      return (
        <select
          ref={selectRef}
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
          ref={inputRef}
          type={type === 'number' ? 'text' : type}
          inputMode={type === 'number' ? (allowDecimal ? 'decimal' : 'numeric') : undefined}
          value={val ?? ''}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
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

  // Handles the cell while it's focused but NOT being edited yet — arrow
  // keys hand off to the grid's navigation (moving between cells, never
  // touching this cell's own value), Enter/F2 open it for editing in
  // place, and any other single printable keystroke opens it for editing
  // WITH that keystroke already typed in, the classic Excel "just start
  // typing over a selected cell" shortcut. Select/date are excluded from
  // that last one — typing a stray letter isn't a meaningful way to set
  // either (a <select> jumps to a matching option on its own once open;
  // a date input's segments expect digits in a specific mm/dd/yyyy order
  // this shortcut would only get in the way of).
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const navDir = NAV_KEYS[e.key]
    if (navDir) {
      e.preventDefault()
      onNavigate?.(navDir)
      return
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      beginEditing()
      return
    }
    if (
      type !== 'select' && type !== 'date' &&
      e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      // Number cells only open-on-type for characters handleChange would
      // actually keep (digits, plus a single "." when allowDecimal) — a
      // stray letter shouldn't open the cell into an edit session that
      // then immediately strips everything back out.
      const numericPattern = allowDecimal ? /^[\d.]$/ : /^\d$/
      if (type === 'number' && !numericPattern.test(e.key)) return
      e.preventDefault()
      beginEditing(e.key)
    }
  }

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onClick={() => beginEditing()}
      onKeyDown={handleCellKeyDown}
      // The dotted underline is a permanent editability affordance — hover
      // states (border/bg) don't exist on touch devices, so without this a
      // cell gives no visual hint it's clickable until the first accidental
      // tap teaches the pattern. Hover styling stays as a bonus for mouse users.
      // focus:ring replaces that same role for keyboard users tabbing/
      // arrowing through the grid — outline-none + ring (not the browser's
      // default outline) so it reads as "this cell" rather than a generic
      // focus rectangle that clips against the table's borders.
      className="px-2 py-1 min-h-[1.75rem] cursor-cell border border-transparent border-b-slate-200 [border-bottom-style:dotted] hover:border-slate-300 hover:bg-slate-50 hover:[border-bottom-style:solid] transition-colors break-words outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 focus:border-b-transparent relative focus:z-10"
    >
      {isEmpty
        ? <span className="text-slate-300 italic">{placeholder ?? 'click to fill'}</span>
        : (format ? format(initialValue) : initialValue)}
    </div>
  )
}