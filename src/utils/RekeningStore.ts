import { useEffect, useState } from 'react'

/**
 * The bank account details shown in the payment instructions on printed
 * invoices and kwitansi. This was previously hardcoded in InvoicePrintPage;
 * now it's editable in the UI and persisted in localStorage so it doesn't
 * need to be retyped for every invoice, and isn't a backend/database
 * concern — it's a per-browser "company settings" value, not order data.
 */
export interface Rekening {
  accountName: string
  bankBranch: string
  accountNumber: string
}

const STORAGE_KEY = 'kma_rekening'

const DEFAULT_REKENING: Rekening = {
  accountName: 'FIFI LESMANA TJHIA',
  bankBranch: 'BCA PLUIT SAMUDRA',
  accountNumber: '602.002.4389',
}

function loadRekening(): Rekening {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_REKENING
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_REKENING, ...parsed }
  } catch {
    return DEFAULT_REKENING
  }
}

/** Reads/writes the rekening block, persisted across sessions and shared
 *  between the invoice print page and the kwitansi page. */
export function useRekening() {
  const [rekening, setRekeningState] = useState<Rekening>(loadRekening)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rekening))
    } catch {
      // Not fatal — worst case the edit doesn't persist to next session.
    }
  }, [rekening])

  const setRekening = (patch: Partial<Rekening>) =>
    setRekeningState(prev => ({ ...prev, ...patch }))

  return { rekening, setRekening }
}