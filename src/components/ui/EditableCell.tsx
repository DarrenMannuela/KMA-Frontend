import { useState, useRef, useEffect, useId } from 'react'

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
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const datalistId = useId()

  useEffect(() => { setVal(initialValue) }, [initialValue])

  useEffect(() => {
    if (!isEditing) return
    if (type === 'select') selectRef.current?.focus()
    else inputRef.current?.focus()
  }, [isEditing, type])

  const commit = (raw: any) => {
    setIsEditing(false)
    if (raw !== initialValue && !(raw === '' && (initialValue === null || initialValue === undefined))) {
      onSave(type === 'number' ? Number(raw) : raw)
    }
  }

  // Native <input type="number"> still lets people type/paste "e", "+", "-"
  // (valid characters for JS number parsing, not valid for a price or qty).
  // Rendering it as text + inputMode="numeric" and filtering here closes
  // that off while keeping the numeric keyboard on mobile. allowDecimal
  // permits a single "." for fields like quantity (2.5 meter of fabric is
  // a normal real-world entry) while still blocking a second dot.
  const handleChange = (raw: string) => {
    if (type !== 'number') { setVal(raw); return }
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
          onChange={(e) => handleChange(e.target.value)}
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