import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { invoiceHooks } from '@/hooks'
import { useIsMobile } from '@/hooks/useIsMobile'
import { InvoiceSwitcher } from '@/components/print/InvoiceSwitcher'
import type { Invoice } from '@/types'
import { InvoicePrintPage } from './InvoicePrintPage'

const OPEN_KEY = 'kma-invoice-list-open'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }

/** The invoice print page with the list of other invoices beside it. The
 *  list lives here, outside the page, so its search and scroll stay put
 *  while invoices change; the page itself starts fresh for each invoice
 *  (keyed by id), so nothing of one invoice's screen state carries over. */
export function InvoicePrintRoute() {
  const { id } = useParams<{ id: string }>()
  const invoiceId = decodeURIComponent(id ?? '')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const { data: invoices = [] } = invoiceHooks.useList()
  // Computer: the side list, remembered between visits (closed at first).
  const [sideOpen, setSideOpen] = useState(readOpen)
  // Phone: the full-screen list, only while picking.
  const [sheetOpen, setSheetOpen] = useState(false)

  const setSide = (open: boolean) => {
    setSideOpen(open)
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* just not remembered */ }
  }
  const pick = (inv: Invoice) => {
    // The list already has the invoice, so the page can show it at once
    // (it still refreshes it from the server).
    if (!qc.getQueryData(['invoice', inv.id])) qc.setQueryData(['invoice', inv.id], inv)
    setSheetOpen(false)
    navigate(`/invoice/${encodeURIComponent(inv.id)}`, { replace: true })
  }
  const open = isMobile ? sheetOpen : sideOpen

  return (
    <>
      {open && (
        <InvoiceSwitcher
          variant={isMobile ? 'sheet' : 'side'}
          invoices={invoices}
          currentId={invoiceId}
          onPick={pick}
          onClose={() => (isMobile ? setSheetOpen(false) : setSide(false))}
        />
      )}
      <InvoicePrintPage
        key={invoiceId}
        invoiceList={{ open, onToggle: () => (isMobile ? setSheetOpen(o => !o) : setSide(!sideOpen)) }}
      />
    </>
  )
}
