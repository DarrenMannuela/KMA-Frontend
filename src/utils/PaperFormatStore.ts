// The paper format each invoice was last printed on, per invoice id, in
// localStorage.
import { useEffect, useState } from 'react'

export type PaperFormat = 'A4' | 'Letter' | 'Legal'

export interface PaperFormatDimensions {
  label: string
  widthMm: number
  heightMm: number
}

// Letter and Legal are inch sizes, kept in mm like everything else.
const INCH_TO_MM = 25.4
export const PAPER_FORMATS: Record<PaperFormat, PaperFormatDimensions> = {
  A4:     { label: 'A4',              widthMm: 210,              heightMm: 297 },
  Letter: { label: 'Letter (US)',     widthMm: 8.5 * INCH_TO_MM, heightMm: 11 * INCH_TO_MM },
  Legal:  { label: 'Legal (US)',      widthMm: 8.5 * INCH_TO_MM, heightMm: 14 * INCH_TO_MM },
}

const STORAGE_PREFIX = 'kma-invoice-paper-format:'
const DEFAULT_FORMAT: PaperFormat = 'A4'

function isPaperFormat(value: string | null): value is PaperFormat {
  return value === 'A4' || value === 'Letter' || value === 'Legal'
}

function loadFormat(invoiceId: string | undefined): PaperFormat {
  if (!invoiceId || typeof localStorage === 'undefined') return DEFAULT_FORMAT
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + invoiceId)
    return isPaperFormat(raw) ? raw : DEFAULT_FORMAT
  } catch {
    return DEFAULT_FORMAT
  }
}

function persistFormat(invoiceId: string, format: PaperFormat) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_PREFIX + invoiceId, format)
  } catch {
    // Storage can fail (private mode): the choice then lasts until a reload.
  }
}

// Plain state: only this one dropdown ever changes it.
export function usePaperFormat(invoiceId: string | undefined): [PaperFormat, (next: PaperFormat) => void] {
  const [format, setFormatState] = useState<PaperFormat>(() => loadFormat(invoiceId))

  // Reload when moving to another invoice without a remount.
  useEffect(() => {
    setFormatState(loadFormat(invoiceId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  const setFormat = (next: PaperFormat) => {
    setFormatState(next)
    if (invoiceId) persistFormat(invoiceId, next)
  }

  return [format, setFormat]
}