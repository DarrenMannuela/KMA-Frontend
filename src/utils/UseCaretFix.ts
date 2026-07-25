// utils/useCaretFix.ts
import { useRef, useLayoutEffect } from 'react'

export function useCaretFix(value: string) {
  const ref = useRef<HTMLInputElement>(null)
  const pos = useRef<number | null>(null)

  const onChange = (transform: (raw: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      pos.current = e.target.selectionStart
      return transform(e.target.value)
    }

  useLayoutEffect(() => {
    if (ref.current && pos.current != null) {
      ref.current.setSelectionRange(pos.current, pos.current)
    }
  }, [value])

  return { ref, onChange }
}