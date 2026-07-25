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
    if (e.key === 'Enter') commit(val)
    if (e.key === 'Escape') {
      setVal(initialValue)
      setIsEditing(false)
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

  return (
    <div
      onClick={() => setIsEditing(true)}
      // The dotted underline is a permanent editability affordance — hover
      // states (border/bg) don't exist on touch devices, so without this a
      // cell gives no visual hint it's clickable until the first accidental
      // tap teaches the pattern. Hover styling stays as a bonus for mouse users.
      className="px-2 py-1 min-h-[1.75rem] cursor-cell border border-transparent border-b-slate-200 [border-bottom-style:dotted] hover:border-slate-300 hover:bg-slate-50 hover:[border-bottom-style:solid] transition-colors break-words"
    >
      {isEmpty
        ? <span className="text-slate-300 italic">{placeholder ?? 'click to fill'}</span>
        : (format ? format(initialValue) : initialValue)}
    </div>
  )
}