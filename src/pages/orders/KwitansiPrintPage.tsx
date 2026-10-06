import { invoiceAmount } from '@/utils/invoiceAmount'
import { useState, useEffect, useLayoutEffect } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi } from '@/api'
import { invoiceHooks } from '@/hooks'
import { useScaleToFit } from '@/hooks/useScaleToFit'
import { useRekening } from '@/utils/RekeningStore'
import { numberToWordsID } from '@/utils/NumberToWordsID'

type PaymentMethod = 'transfer' | 'cheque' | 'bilyet_giro'

// Sizes an inline input to its text's real width (measured on a canvas in the
// input's own font), so long all-caps names aren't clipped.
let measureCanvas: HTMLCanvasElement | null = null
function measureTextWidth(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * 8 // crude fallback if canvas is ever unavailable
  ctx.font = font
  return ctx.measureText(text).width
}

function useAutoWidthInput(text: string, font: string, minWidthPx = 60) {
  const [width, setWidth] = useState(minWidthPx)
  useLayoutEffect(() => {
    // +6px slack so the caret/last character never sits flush against the
    // box edge (and so a freshly-typed character has room before the next
    // measurement pass catches up).
    setWidth(Math.max(minWidthPx, measureTextWidth(text, font) + 6))
  }, [text, font, minWidthPx])
  return width
}

// ── Print-critical layout: the company's paper kwitansi (A4, exact mm) ──
const PAGE_STYLE: CSSProperties = {
  width: '210mm', minHeight: '148mm', padding: '18mm 20mm',
  fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#000',
}

// One label width for every "label : value" row, so the colons line up.
const LABEL_COL_W = 'w-[150px]'

// A "Label : value" row on the shared label column.
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex mb-2.5 last:mb-0">
      <span className={`${LABEL_COL_W} shrink-0`}>{label}</span>
      <span>: {children}</span>
    </div>
  )
}

// One editable line in the bank-details block (BANK / NAMA / NO REK).
// Value + onChange come straight from the shared RekeningStore, so
// whatever's typed here is remembered across kwitansi prints.
function RekeningField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex mb-1 last:mb-0">
      <span className={`${LABEL_COL_W} shrink-0`}>{label}</span>
      <span>
        {': '}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          // font: inherit has no Tailwind utility — without it the input
          // falls back to the browser's default form-control font instead
          // of matching the surrounding Arial receipt text.
          style={{ font: 'inherit' }}
          className="border-none bg-transparent w-[260px] p-0"
        />
      </span>
    </div>
  )
}

// One Transfer/Cheque/Giro option — an "✕" appears in the box when
// selected, matching the paper template's checkbox.
function PaymentMethodOption({ label, active, onClick }: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ font: 'inherit' }}
      className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer"
    >
      <span className="w-[18px] h-[18px] border-2 border-black flex items-center justify-center font-bold">
        {active ? '✕' : ''}
      </span>
      {label}
    </button>
  )
}

// "Label : value" for the short header fields (No / INV / TGL).
function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex font-bold">
      <span className="w-[34px] shrink-0">{label}</span>
      <span>: {children}</span>
    </div>
  )
}

// An editable header field, for the receipt book's own number, which isn't
// stored anywhere.
function EditableHeaderField({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  // This row is font-bold, so the width has to be measured in a bold font
  // too — a regular-weight measurement would under-size a bold-rendered
  // string and clip it the same way the old `size` attribute did.
  const width = useAutoWidthInput(value || placeholder || '', 'bold 13px Arial')
  return (
    <div className="flex font-bold">
      <span className="w-[34px] shrink-0">{label}</span>
      <span>
        {': '}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ font: 'inherit', width }}
          className="border-none bg-transparent p-0 placeholder:font-normal placeholder:text-slate-300"
        />
      </span>
    </div>
  )
}

// The receipt for an invoice, made from the invoice and order; only printed.
export function KwitansiPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')
  const { rekening, setRekening } = useRekening()
  const [method, setMethod] = useState<PaymentMethod>('transfer')

  // Shrinks the preview to fit the screen; printing is unaffected.
  const { containerRef: scaleContainerRef, docRef: scaleDocRef, scale, scaledWidth, scaledHeight } = useScaleToFit(true)

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  })

  const { data: order, isError: isOrderError, refetch: refetchOrder } = useQuery({
    queryKey: ['order', invoice?.order_id],
    queryFn: () => ordersApi.get(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  // All invoices, to find this order's other half (DP or Pelunasan) by order_id.
  const { data: allInvoices = [], isError: isAllInvoicesError, refetch: refetchAllInvoices } = invoiceHooks.useList()
  const dpInvoice = invoice?.type === 'dp'
    ? invoice
    : allInvoices.find(i => i.order_id === invoice?.order_id && i.type === 'dp')
  const pelunasanInvoice = invoice?.type === 'pelunasan'
    ? invoice
    : allInvoices.find(i => i.order_id === invoice?.order_id && i.type === 'pelunasan')

  // ── Typed by hand for each print: receipt number, purpose and signer ──
  const [kwitansiNo, setKwitansiNo] = useState('')
  const [signerName, setSignerName] = useState('')
  // font-semibold ≈ weight 600 — measuring at the same weight the field
  // actually renders in, same reasoning as EditableHeaderField's bold
  // measurement above.
  const signerWidth = useAutoWidthInput(signerName || 'NAMA PENERIMA', '600 13px Arial')
  const [purposeText, setPurposeText] = useState('')
  const [purposeTouched, setPurposeTouched] = useState(false)
  useEffect(() => {
    if (!purposeTouched && order && invoice) {
      setPurposeText(`PEMESANAN ${(order.company ?? invoice.kepada_yth).toUpperCase()}`)
    }
  }, [order, invoice, purposeTouched])
  const purposeWidth = useAutoWidthInput(purposeText || 'PEMESANAN SERAGAM …', '13px Arial')

  if (isLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // A failed fetch shows Retry rather than "not found" or a wrong payment status.
  if (isError || isOrderError || isAllInvoicesError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this invoice — check your connection and try again.</p>
        <button onClick={() => { refetch(); refetchOrder(); refetchAllInvoices() }} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!invoice) return <div className="p-8 text-red-400">Invoice not found.</div>

  // What this receipt is for (see invoiceAmount: a 0% DP is a full payment).
  const isFullInvoice = invoice.type === 'dp' && (invoice.down_payment ?? 0) === 0
  const amount = invoiceAmount(invoice)
  const purposeLabel = invoice.type === 'dp' && !isFullInvoice ? 'DOWN PAYMENT (D/P)' : 'PELUNASAN'

  // The big figure is the order's full total, with the DP/Pelunasan split below.
  const printAmount = invoice.total || amount

  // ── D/P line ──────────────────────────────────────────────────────────
  const dpAmount = dpInvoice?.down_payment ?? 0
  const dpPercent = dpInvoice?.total ? Math.round((dpAmount / dpInvoice.total) * 100) : null
  const dpPaidLabel = !dpInvoice
    ? null
    : dpInvoice.status === 'paid' && dpInvoice.paid_date
      ? `LUNAS - ${format(new Date(dpInvoice.paid_date), 'd MMMM yyyy').toUpperCase()}`
      : 'BELUM LUNAS'

  // ── Sisa: the Pelunasan invoice's balance, or total minus DP before one exists ──
  const sisaAmount = pelunasanInvoice
    ? (pelunasanInvoice.ar_receivable ?? pelunasanInvoice.remaining ?? 0)
    : (invoice.total ?? 0) - dpAmount
  // A full invoice's own status and dates, there being no Pelunasan.
  const sisaDueLabel = isFullInvoice
    ? (invoice.status === 'paid' && invoice.paid_date
        ? `LUNAS - ${format(new Date(invoice.paid_date), 'd MMMM yyyy').toUpperCase()}`
        : invoice.due_date
          ? `J/T - ${format(new Date(invoice.due_date), 'd MMMM yyyy').toUpperCase()}`
          : null)
    : pelunasanInvoice?.due_date
      ? `J/T - ${format(new Date(pelunasanInvoice.due_date), 'd MMMM yyyy').toUpperCase()}`
      : pelunasanInvoice
        ? null
        : 'PELUNASAN BELUM DITERBITKAN'

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">Kwitansi — {invoice.id}</span>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* The page is a fixed physical width: it scrolls (and is scaled to fit) here
         so it doesn't widen the toolbar. Printing uses the real size. */}
      <div className="p-8 print:p-0 overflow-x-auto print:overflow-visible" ref={scaleContainerRef}>
        <div
          className="scale-wrap"
          style={{ width: scaledWidth || undefined, height: scaledHeight || undefined, overflow: 'hidden' }}
        >
        <div
          id="kwitansi"
          ref={scaleDocRef}
          className="bg-white mx-auto shadow-lg print:shadow-none"
          style={{ ...PAGE_STYLE, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-7">
            <div className="flex flex-col items-center">
              {/* Centered whichever of logo and name is wider. */}
              <img src="/Logo.png" alt="KMA Logo" className="block w-20 h-auto mb-1" />
              <div className="font-bold text-sm tracking-[2px]">KREASI MAKMUR ABADI</div>
            </div>

            <div className="text-center flex-1">
              <div className="font-bold text-[26px] tracking-[4px] underline underline-offset-4">
                KWITANSI
              </div>
            </div>

            <div className="min-w-[200px] space-y-1">
              <EditableHeaderField label="No" value={kwitansiNo} onChange={setKwitansiNo} placeholder="052/KMA/08/26" />
              <HeaderField label="INV">{invoice.id}</HeaderField>
              <HeaderField label="TGL">{format(new Date(invoice.tanggal), 'd MMM yyyy').toUpperCase()}</HeaderField>
            </div>
          </div>

          {/* Bordered body */}
          <div className="border-2 border-black">
            <div className="px-4 py-3.5 border-b border-black">
              <InfoRow label="Sudah terima dari">{invoice.kepada_yth}</InfoRow>
              <InfoRow label="Banyaknya Uang">{numberToWordsID(printAmount).toUpperCase()}</InfoRow>
            </div>

            <div className="px-4 py-3.5 border-b border-black min-h-[70px]">
              <div className="mb-1.5">
                {purposeLabel} UNTUK{' '}
                <input
                  value={purposeText}
                  onChange={e => { setPurposeTouched(true); setPurposeText(e.target.value.toUpperCase()) }}
                  placeholder="PEMESANAN SERAGAM …"
                  style={{ font: 'inherit', width: purposeWidth }}
                  className="border-none bg-transparent p-0 placeholder:font-normal placeholder:text-slate-300"
                />
                , TERLAMPIR:
              </div>
              <ul className="list-disc m-0 pl-5 space-y-0.5">
                <li>ASLI SURAT JALAN</li>
                {isFullInvoice ? (
                  <li>ASLI INVOICE NO {invoice.id}</li>
                ) : (
                  <li>
                    ASLI INVOICE NO {dpInvoice?.id ?? '—'} (D/P) & {pelunasanInvoice?.id ?? '—'} (PELUNASAN)
                  </li>
                )}
                {/* No D/P line for a 0% DP; the Sisa line is always shown. */}
                {!isFullInvoice && (
                  <li className="font-bold">
                    D/P{dpPercent != null ? ` ${dpPercent}%` : ''} : Rp {Math.round(dpAmount).toLocaleString('id-ID')}
                    {dpPaidLabel ? ` (${dpPaidLabel})` : ''}
                  </li>
                )}
                <li className="font-bold">
                  SISA YANG HARUS DI LUNASI : Rp {Math.round(sisaAmount).toLocaleString('id-ID')}
                  {sisaDueLabel ? ` (${sisaDueLabel})` : ''}
                </li>
              </ul>
            </div>

            <div className="p-4">
              <div className="font-bold text-[26px] mb-3.5">
                RP. {Math.round(printAmount).toLocaleString('id-ID')},-
              </div>

              <div className="flex gap-7 items-center mb-3">
                <PaymentMethodOption label="TRANSFER" active={method === 'transfer'} onClick={() => setMethod('transfer')} />
                <PaymentMethodOption label="CHEQUE" active={method === 'cheque'} onClick={() => setMethod('cheque')} />
                <PaymentMethodOption label="BILYET GIRO" active={method === 'bilyet_giro'} onClick={() => setMethod('bilyet_giro')} />
              </div>

              <div>
                <RekeningField label="BANK" value={rekening.bankBranch} onChange={v => setRekening({ bankBranch: v })} />
                <RekeningField label="NAMA" value={rekening.accountName} onChange={v => setRekening({ accountName: v })} />
                <RekeningField label="NO REK" value={rekening.accountNumber} onChange={v => setRekening({ accountNumber: v })} />
              </div>

              {/* The signer's name, right-aligned below the bank block with room to sign. */}
              <div className="flex justify-end mt-8">
                <input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value.toUpperCase())}
                  placeholder="NAMA PENERIMA"
                  style={{ font: 'inherit', width: signerWidth }}
                  className="border-none bg-transparent p-0 text-center font-semibold placeholder:font-normal placeholder:text-slate-300"
                />
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
          #kwitansi { width: 100% !important; margin: 0 !important; transform: none !important; }
          /* Undo the on-screen scaling when printing. */
          .scale-wrap { width: auto !important; height: auto !important; overflow: visible !important; }
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