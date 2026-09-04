import { useState, useEffect, useLayoutEffect } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi } from '@/api'
import { invoiceHooks } from '@/hooks'
import { useRekening } from '@/utils/RekeningStore'
import { numberToWordsID } from '@/utils/NumberToWordsID'

type PaymentMethod = 'transfer' | 'cheque' | 'bilyet_giro'

// Auto-sizes an inline text input to the ACTUAL rendered pixel width of its
// content, instead of the HTML `size` attribute's character-count guess.
// `size` assumes an average glyph width, but every field this feeds
// (kwitansi No, purpose line, signer name) is forced ALL-CAPS on input —
// and uppercase runs (especially wide letters, long company names like
// "PT ZENBU ASIA PERMATA...") are wider than that average. A too-narrow
// input box doesn't wrap or show a scrollbar, it just silently clips the
// tail of the text — that's what produced "PT ZENBU ASIA PEF" instead of
// the full company name. Measuring with a canvas using the SAME font the
// input actually renders in gives the true width, so the box is always at
// least as wide as its content.
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

// ── Print-critical layout ────────────────────────────────────────────────
// Kept as an inline style, not Tailwind, because these are physical
// measurements matching the company's existing paper kwitansi template
// (A4 box, exact mm margins) — not something to round off to Tailwind's
// spacing scale. Everything inside inherits its font/size/color from here,
// so child elements don't need to restate them.
const PAGE_STYLE: CSSProperties = {
  width: '210mm', minHeight: '148mm', padding: '18mm 20mm',
  fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#000',
}

// One shared label-column width for EVERY "label : value" row on the
// receipt — the body section (Sudah terima dari / Banyaknya Uang) and the
// bank-details section (BANK / NAMA / NO REK) used to have their own
// widths (150px vs 90px), so the colons landed at two different x-
// positions depending which section you looked at. One constant means one
// straight column of colons down the whole card.
const LABEL_COL_W = 'w-[150px]'

// A "Label : value" row with a fixed-width label column so the colons all
// line up regardless of label length — used for "Sudah terima dari" /
// "Banyaknya Uang". Every row but the last carries the gap; `last:mb-0`
// zeroes it on whichever InfoRow happens to be last, same as the original
// hand-placed marginBottoms did.
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

// "Label : value" for a header field (No / INV / TGL) — its own (much
// narrower) label width than InfoRow's, since these labels are short
// (2-3 chars) and would otherwise land their colons at a different
// x-position than InfoRow's longer labels the same way the body rows did
// before LABEL_COL_W unified those.
function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex font-bold">
      <span className="w-[34px] shrink-0">{label}</span>
      <span>: {children}</span>
    </div>
  )
}

// Same shape as HeaderField, but an editable line — for the physical
// Kwitansi number ("No"), which (unlike INV, the system's real invoice
// number) has no backing field in the data model. Paper receipt books
// number their own copies independently of the invoice numbering, so this
// is filled in by hand at print time, the same way BANK/NAMA/NO REK
// already are via RekeningField above.
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

// The Kwitansi (receipt) is generated purely from the existing Invoice +
// Order records — it's not its own database entity. It exists only for
// printing/handing to the client and for the company's own bookkeeping
// copy, so there's nothing here worth persisting beyond what the invoice
// already stores (plus a few purely-per-print fields — see kwitansiNo/
// purposeText/signerName below — that have no backing field at all).
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

  // This Kwitansi shows the WHOLE payment schedule (both the D/P and the
  // Pelunasan halves) regardless of which one it's actually being printed
  // against — but each half's own paid/due date only lives on ITS OWN
  // invoice record, not necessarily the one loaded above. Pulling the full
  // list and matching by order_id (rather than guessing the sibling's ID
  // from this one's) is the same approach GenerateInvoiceForm.tsx uses;
  // its own suggestNextInvoiceId comment is explicit that the ".1" suffix
  // pattern is legacy only — new invoice numbers are independently
  // suggested, not deterministically derived from each other, so a string
  // trick here would silently misfire on current data.
  const { data: allInvoices = [] } = invoiceHooks.useList()
  const dpInvoice = invoice?.type === 'dp'
    ? invoice
    : allInvoices.find(i => i.order_id === invoice?.order_id && i.type === 'dp')
  const pelunasanInvoice = invoice?.type === 'pelunasan'
    ? invoice
    : allInvoices.find(i => i.order_id === invoice?.order_id && i.type === 'pelunasan')

  // ── Fields with no backing data at all ──────────────────────────────────
  // The physical Kwitansi number, the free-text payment-purpose line, and
  // the signer's name don't correspond to anything in the Invoice/Order
  // records — there's no "order description" or "kwitansi sequence"
  // field anywhere in this data model (checked InvoicePrintPage.tsx too).
  // Treated the same way BANK/NAMA/NO REK already are: plain editable
  // text, filled in by hand per print. Unlike those, these are per-
  // DOCUMENT rather than per-company, so they're local state (reset for
  // each invoice) instead of living in the shared RekeningStore.
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

  // The big printed figure and the "Banyaknya Uang" words-amount are the
  // order's FULL total when there's an actual D/P/Pelunasan split to show
  // underneath (matching the reference design, which totals both halves
  // together) — not just this one document's own partial amount. For a
  // full/single invoice the two are the same number anyway (down_payment
  // is 0, so total === amount), so this changes nothing in that case.
  const printAmount = invoice.total || amount

  // ── D/P line ──────────────────────────────────────────────────────────
  const dpAmount = dpInvoice?.down_payment ?? 0
  const dpPercent = dpInvoice?.total ? Math.round((dpAmount / dpInvoice.total) * 100) : null
  const dpPaidLabel = !dpInvoice
    ? null
    : dpInvoice.status === 'paid' && dpInvoice.paid_date
      ? `LUNAS - ${format(new Date(dpInvoice.paid_date), 'd MMMM yyyy').toUpperCase()}`
      : 'BELUM LUNAS'

  // ── Sisa (remaining) line ─────────────────────────────────────────────
  // Prefers the Pelunasan invoice's own ar_receivable/remaining (post-
  // discount, same convention as `amount` above) — falls back to a plain
  // total-minus-down_payment only when no Pelunasan invoice has been
  // raised yet for this order, since there's nothing else to read it from.
  const sisaAmount = pelunasanInvoice
    ? (pelunasanInvoice.ar_receivable ?? pelunasanInvoice.remaining ?? 0)
    : (invoice.total ?? 0) - dpAmount
  // Full-invoice (0% D/P) case has no separate Pelunasan invoice to read a
  // paid/due date from — the invoice being printed IS the whole payment,
  // so its own status/paid_date/due_date carry that instead, mirroring
  // dpPaidLabel's LUNAS-vs-BELUM-LUNAS convention above rather than the
  // "PELUNASAN BELUM DITERBITKAN" wording, which only makes sense when a
  // D/P-then-Pelunasan split actually exists.
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
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">Kwitansi — {invoice.id}</span>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Kwitansi document */}
      <div className="p-8 print:p-0">
        <div id="kwitansi" className="bg-white mx-auto shadow-lg print:shadow-none" style={PAGE_STYLE}>
          {/* Header */}
          <div className="flex items-start justify-between mb-7">
            <div className="flex flex-col items-center">
              {/* items-center on the parent (not text-align/mx-auto) so
                  this stays correct regardless of how wide the logo image
                  ends up relative to the "KREASI MAKMUR ABADI" text below
                  it — whichever of the two is wider, the narrower one
                  centers under/over it exactly. */}
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
                {/* D/P line only applies when there's an actual down
                    payment to report (dp% > 0) — a 0% D/P isn't a real
                    down payment, so this line is skipped rather than
                    printing "D/P 0% : Rp 0". The Sisa line, however,
                    always applies: even a full invoice (0% D/P) has an
                    amount still owed until it's paid, so it's shown
                    either way — just computed against the invoice's own
                    total/due-date instead of a sibling Pelunasan invoice
                    (see sisaDueLabel above). */}
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

              {/* Signer's name — no backing field (see the comment on
                  kwitansiNo/signerName above), filled in by whoever hands
                  over/prints this specific receipt. Sits BELOW the bank
                  block with a gap above it (room for an actual wet
                  signature), right-aligned — matching the reference
                  template's placement. Previously shared a flex row with
                  the bank-details block, which squeezed that column's
                  width and made its fixed-width inputs wrap onto their
                  own line; a plain block below it has the full row width
                  to itself instead. */}
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