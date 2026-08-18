// Remembers which paper format a given invoice was last printed on —
// keyed by invoice id rather than globally (unlike ColumnWidthsStore's
// column widths, which are meant to be one shared preference across every
// invoice): a paper size is a property of a specific printed document, not
// a display preference, so invoice 001 and invoice 045 have no reason to
// share one. Picked per invoice in the toolbar, persisted to localStorage
// so reopening the same invoice later remembers the choice.
import { useEffect, useState } from 'react'

export type PaperFormat = 'A4' | 'Letter' | 'Legal'

export interface PaperFormatDimensions {
  label: string
  widthMm: number
  heightMm: number
}

// Letter/Legal are defined in inches by convention (8.5in wide either way)
// — converted to mm here since every other measurement in this file (page
// margins, column widths' physical intent, etc.) is already mm-based, so
// one consistent unit avoids a conversion at every call site.
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
    // Storage can fail (private browsing, quota) — the choice still holds
    // for the rest of this session via React state, it just won't survive
    // a reload. Not worth surfacing to the user over, same call as
    // ColumnWidthsStore's identical tradeoff.
  }
}

// Plain useState + effect rather than ColumnWidthsStore's
// useSyncExternalStore pattern: that one exists because column widths can
// be written from OUTSIDE React (a raw mousemove listener mid-drag) and
// are shared across every mounted consumer at once. A paper format is
// only ever changed by this one dropdown, from inside a normal React event
// handler, for one invoice at a time — an ordinary external-store
// subscription isn't buying anything extra here.
export function usePaperFormat(invoiceId: string | undefined): [PaperFormat, (next: PaperFormat) => void] {
  const [format, setFormatState] = useState<PaperFormat>(() => loadFormat(invoiceId))

  // Re-sync if the id itself changes (e.g. navigating from one invoice's
  // print page straight to another without a full remount) — without
  // this, the second invoice would keep showing the first one's format
  // until a manual reload.
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