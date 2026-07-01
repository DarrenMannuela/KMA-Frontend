import { useState, useRef, useEffect } from 'react'

interface SelectOption {
  value: string | number
  label: string
}

interface EditableCellProps {
  value: any
  type?: 'text' | 'number' | 'select'
  options?: SelectOption[]
  onSave: (val: any) => void
  format?: (val: any) => React.ReactNode
  placeholder?: string
}

export function EditableCell({
  value: initialValue,
  type = 'text',
  options,
  onSave,
  format,
  placeholder,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

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
      <input
        ref={inputRef}
        type={type}
        value={val ?? ''}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => commit(val)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-sm border-2 border-blue-500 rounded outline-none bg-white"
      />
    )
  }

  const isEmpty = initialValue === '' || initialValue === null || initialValue === undefined

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="px-2 py-1 min-h-[1.75rem] cursor-cell border border-transparent hover:border-slate-300 hover:bg-slate-50 transition-colors"
    >
      {isEmpty
        ? <span className="text-slate-300 italic">{placeholder ?? 'click to fill'}</span>
        : (format ? format(initialValue) : initialValue)}
    </div>
  )
}
