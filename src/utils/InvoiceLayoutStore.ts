// How each invoice was last laid out for printing, per invoice id, in this
// browser's localStorage (like the paper format): column widths dragged by
// hand, and which items have their sizes folded into one line. Nothing here
// is the invoice's data, only how it's shown, so it isn't saved on the server.
import { useEffect, useState } from 'react'

export type InvoiceColumn = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

export interface InvoiceLayout {
  /** Widths in px set by dragging; a column not listed is fitted to its contents. */
  widths: Partial<Record<InvoiceColumn, number>>
  /** Item names whose sizes print as one line. */
  folded: string[]
}

const STORAGE_PREFIX = 'kma-invoice-layout:'
const EMPTY: InvoiceLayout = { widths: {}, folded: [] }

function load(invoiceId: string | undefined): InvoiceLayout {
  if (!invoiceId || typeof localStorage === 'undefined') return EMPTY
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + invoiceId)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<InvoiceLayout>
    return { widths: parsed.widths ?? {}, folded: Array.isArray(parsed.folded) ? parsed.folded : [] }
  } catch {
    return EMPTY
  }
}

function persist(invoiceId: string, layout: InvoiceLayout) {
  if (typeof localStorage === 'undefined') return
  try {
    if (!Object.keys(layout.widths).length && !layout.folded.length) localStorage.removeItem(STORAGE_PREFIX + invoiceId)
    else localStorage.setItem(STORAGE_PREFIX + invoiceId, JSON.stringify(layout))
  } catch {
    // Storage blocked or full: the layout simply isn't remembered.
  }
}

export function useInvoiceLayout(invoiceId: string | undefined) {
  const [layout, setLayout] = useState<InvoiceLayout>(() => load(invoiceId))
  // The invoice id arrives after its query loads.
  useEffect(() => { setLayout(load(invoiceId)) }, [invoiceId])
  const update = (fn: (prev: InvoiceLayout) => InvoiceLayout) => {
    setLayout(prev => {
      const next = fn(prev)
      if (invoiceId) persist(invoiceId, next)
      return next
    })
  }
  return {
    layout,
    setWidth: (col: InvoiceColumn, px: number | null) => update(prev => {
      const widths = { ...prev.widths }
      if (px == null) delete widths[col]
      else widths[col] = Math.round(px)
      return { ...prev, widths }
    }),
    resetWidths: () => update(prev => ({ ...prev, widths: {} })),
    toggleFold: (name: string) => update(prev => ({
      ...prev,
      folded: prev.folded.includes(name) ? prev.folded.filter(n => n !== name) : [...prev.folded, name],
    })),
    setFolded: (names: string[]) => update(prev => ({ ...prev, folded: names })),
  }
}
