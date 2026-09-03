import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi } from '@/api'
import { useRekening } from '@/utils/RekeningStore'
import { numberToWordsID } from '@/utils/NumberToWordsID'

type PaymentMethod = 'transfer' | 'bilyet_giro'

// The Kwitansi (receipt) is generated purely from the existing Invoice +
// Order records — it's not its own database entity. It exists only for
// printing/handing to the client and for the company's own bookkeeping
// copy, so there's nothing here worth persisting beyond what the invoice
// already stores. Layout matches the company's existing paper kwitansi
// template (bordered box, "Sudah terima dari" / "Banyaknya Uang" /
// "Untuk pembayaran" fields, big Rp amount, Transfer/Bilyet Giro checkbox).
export function KwitansiPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')
  const { rekening, setRekening } = useRekening()
  const [method, setMethod] = useState<PaymentMethod>('transfer')

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  })

  const { data: order } = useQuery({
    queryKey: ['order', invoice?.order_id],
    queryFn: () => ordersApi.get(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  if (isLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // Distinguish "the fetch actually failed" (network drop, 500, etc.) from
  // "the server answered and there's genuinely no such invoice" — these
  // used to render identically as "Invoice not found.", which sent people
  // down a dead end (double-checking an ID that was actually fine) instead
  // of just retrying the request that failed.
  if (isError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this invoice — check your connection and try again.</p>
        <button onClick={() => refetch()} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!invoice) return <div className="p-8 text-red-400">Invoice not found.</div>

  // The amount THIS kwitansi is a receipt for — the D/P amount if this is
  // a DP invoice, the remaining balance if this is the Pelunasan invoice.
  // A 0% down payment isn't really a "down payment" — same convention as
  // OrderDetailPage/InvoiceListPage/InvoicePrintPage — so a dp-type
  // invoice with nothing actually down is treated as a full/Pelunasan
  // payment here too: a receipt for "D/P — Rp 0" would be meaningless.
  //
  // For the Pelunasan/full-payment case, this reads ar_receivable (the
  // discount-already-applied figure GenerateInvoiceForm computes and
  // saves), not the plain `remaining` field — `remaining` is total minus
  // down_payment BEFORE any discount, so using it here would print a
  // receipt asking for more than the client actually owes whenever a
  // discount was applied. Falls back to `remaining` only for older
  // invoices saved before ar_receivable existed.
  const isFullInvoice = invoice.type === 'dp' && (invoice.down_payment ?? 0) === 0
  const amount = invoice.type === 'dp' && !isFullInvoice
    ? (invoice.down_payment ?? 0)
    : (invoice.ar_receivable ?? invoice.remaining)
  const purposeLabel = invoice.type === 'dp' && !isFullInvoice ? 'DOWN PAYMENT (D/P)' : 'PELUNASAN'

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">Kwitansi — {invoice.id}</span>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Kwitansi document */}
      <div className="p-8 print:p-0">
        <div
          id="kwitansi"
          className="bg-white mx-auto shadow-lg print:shadow-none"
          style={{ width: '210mm', minHeight: '148mm', padding: '18mm 20mm', fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#000' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
            <div>
              <img src="/Logo.png" alt="KMA Logo" style={{ width: '80px', height: 'auto', marginBottom: '8px' }} />
              <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px', fontFamily: 'Arial, sans-serif' }}>KREASI MAKMUR ABADI</div>
            </div>

            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '26px', letterSpacing: '4px', textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                KWITANSI
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '20px', letterSpacing: '5px', marginTop: '4px' }}>
                RECEIPT
              </div>
            </div>

            <div style={{ textAlign: 'right', fontFamily: 'Arial, sans-serif', fontSize: '13px', minWidth: '180px' }}>
              <div style={{ fontWeight: 'bold' }}>No : {invoice.id}</div>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>TGL : {format(new Date(invoice.tanggal), 'd MMM yyyy').toUpperCase()}</div>
            </div>
          </div>

          {/* Bordered body */}
          <div style={{ border: '2px solid #000' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #000' }}>
              <div style={{ display: 'flex', marginBottom: '10px' }}>
                <span style={{ width: '150px', flexShrink: 0 }}>Sudah terima dari</span>
                <span>: {invoice.kepada_yth}</span>
              </div>
              <div style={{ display: 'flex' }}>
                <span style={{ width: '150px', flexShrink: 0 }}>Banyaknya Uang</span>
                <span>: {numberToWordsID(amount).toUpperCase()}</span>
              </div>
            </div>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid #000', minHeight: '70px' }}>
              <div style={{ marginBottom: '6px' }}>
                Untuk pembayaran: {purposeLabel} — ORDER {order?.id ?? invoice.order_id}
                {order?.po_number ? ` (PO ${order.po_number})` : ''}
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li>INVOICE {invoice.id}{invoice.untuk ? ` — u.p. ${invoice.untuk.toUpperCase()}` : ''}</li>
              </ul>
            </div>

            <div style={{ padding: '16px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '26px', marginBottom: '14px' }}>
                RP. {Math.round(amount).toLocaleString('id-ID')},-
              </div>

              <div style={{ display: 'flex', gap: '28px', alignItems: 'center', marginBottom: '12px', fontFamily: 'Arial, sans-serif' }}>
                <button
                  type="button"
                  onClick={() => setMethod('transfer')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
                >
                  <span style={{ width: '18px', height: '18px', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {method === 'transfer' ? '✕' : ''}
                  </span>
                  TRANSFER
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('bilyet_giro')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
                >
                  <span style={{ width: '18px', height: '18px', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {method === 'bilyet_giro' ? '✕' : ''}
                  </span>
                  GIRO
                </button>
              </div>

              <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
                <div style={{ display: 'flex', marginBottom: '4px' }}>
                  <span style={{ width: '90px', flexShrink: 0 }}>BANK</span>
                  <span>: <input
                    value={rekening.bankBranch}
                    onChange={e => setRekening({ bankBranch: e.target.value })}
                    style={{ border: 'none', background: 'transparent', font: 'inherit', width: '260px', padding: 0 }}
                  /></span>
                </div>
                <div style={{ display: 'flex', marginBottom: '4px' }}>
                  <span style={{ width: '90px', flexShrink: 0 }}>NAMA</span>
                  <span>: <input
                    value={rekening.accountName}
                    onChange={e => setRekening({ accountName: e.target.value })}
                    style={{ border: 'none', background: 'transparent', font: 'inherit', width: '260px', padding: 0 }}
                  /></span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', flexShrink: 0 }}>NO REK</span>
                  <span>: <input
                    value={rekening.accountNumber}
                    onChange={e => setRekening({ accountNumber: e.target.value })}
                    style={{ border: 'none', background: 'transparent', font: 'inherit', width: '260px', padding: 0 }}
                  /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          #kwitansi { width: 100% !important; margin: 0 !important; }
          @page { size: A4; margin: 0; }
          aside { display: none !important; }
          header { display: none !important; }
          .ml-\\[240px\\] { margin-left: 0 !important; }
          nav { display: none !important; }
        }
      `}</style>
    </div>
  )
}