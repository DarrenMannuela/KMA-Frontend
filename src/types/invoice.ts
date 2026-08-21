// ─── Matches dto/Invoice.go ────────────────────────────────────────────────
export interface Invoice {
  id: string
  order_id: string
  type: string
  kepada_yth: string
  untuk: string
  alamat: string
  email: string | null
  telp: string | null
  start_produksi: string | null
  lama_produksi: string | null
  total: number
  down_payment: number | null
  discount: number | null
  remaining: number
  ar_receivable: number
  tanggal: string
  due_date: string | null
  paid_date: string | null
  status: string
}

// ─── Request / Create DTOs ────────────────────────────────────────────────────
export type CreateInvoiceRequest = Omit<Invoice, 'remaining' | 'ar_receivable'> & {
  remaining?: number
  ar_receivable?: number
}
export type UpdateInvoiceRequest = Partial<CreateInvoiceRequest>
