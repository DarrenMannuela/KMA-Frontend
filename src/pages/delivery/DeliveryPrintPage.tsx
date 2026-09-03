import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { deliveryApi, deliveryItemApi } from '@/api'
import type { Delivery, DeliveryItem } from '@/types'

// Matches the company's paper DO/SJ template: letterhead, a
// TANGGAL/NAMA/UNTUK/HP/ALAMAT/PO field grid, then for DO one bordered
// "KODE BOX NN" table per box (NO/DETAILS/SIZE/QTY-PCS with a TOTAL ITEMS
// footer row) — grouped by item name, same as the in-app box view, no
// separate category field. SJ has no box concept, so it's a flat document
// list instead.
//
// Two box slips share one physical A4 sheet (stacked, split by a dashed cut
// line) instead of one slip per page — a single box's content is short, so
// one-per-page was mostly whitespace. A lone slip (the normal case for a
// SJ, which has no box split most of the time) fills at least half the
// sheet on its own — enough that the printout doesn't read as an
// almost-empty page — with the signature block anchored to the bottom of
// that half rather than sitting right under a three-line item list. The
// final Rekap page is its own full sheet, grouped by box with a per-box
// subtotal and one grand total across the whole delivery, so it can be
// checked against the order box-by-box instead of just as one flat list.
export function DeliveryPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const deliveryId = decodeURIComponent(id ?? '')

  const { data: delivery, isLoading, isError, refetch } = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => deliveryApi.get(deliveryId),
    enabled: !!deliveryId,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['delivery-items', deliveryId],
    queryFn: () => deliveryItemApi.list().then(all => all.filter((i: DeliveryItem) => i.delivery_id === deliveryId)),
    enabled: !!deliveryId,
  })

  const isDO = delivery?.type === 'DO'

  // Same grouping as the on-screen box view — items with no box number
  // land in a trailing group instead of vanishing from the printout. Now
  // applies to SJ too: "KODE PAKET" on a Surat Jalan is the same
  // box_number field as DO's "KODE BOX", just labeled differently.
  const boxGroups = useMemo(() => {
    const map = new Map<string, DeliveryItem[]>()
    items.forEach(item => {
      const key = item.box_number != null ? String(item.box_number) : 'unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    })
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'unassigned') return 1
      if (b === 'unassigned') return -1
      return Number(a) - Number(b)
    })
  }, [items])

  // Rekap now mirrors the box structure instead of flattening straight to
  // one item/size list: each box gets its own DETAILS/SIZE/QTY block with a
  // subtotal, so the printed recap can be checked against each box as
  // packed, then one grand total across every box at the bottom.
  const rekapBoxes = useMemo(() => {
    return boxGroups.map(([boxLabel, boxItems]) => {
      const map = new Map<string, { item_name: string; size: string | null; total: number }>()
      boxItems.forEach(item => {
        const key = `${item.item_name}|${item.size ?? ''}`
        if (!map.has(key)) map.set(key, { item_name: item.item_name, size: item.size, total: 0 })
        map.get(key)!.total += item.amount
      })
      const rows = Array.from(map.values()).sort((a, b) => a.item_name.localeCompare(b.item_name))
      return {
        boxLabel: boxLabel === 'unassigned' ? null : boxLabel,
        rows,
        subtotal: rows.reduce((s, r) => s + r.total, 0),
      }
    })
  }, [boxGroups])

  const grandTotal = rekapBoxes.reduce((s, b) => s + b.subtotal, 0)

  if (isLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // Same distinction made in KwitansiPrintPage/InvoicePrintPage/
  // OrderDetailPage: a failed fetch (network drop, 500, etc.) previously
  // looked identical to a genuinely missing delivery — "Delivery not
  // found." — sending people searching for a bad link instead of just
  // retrying the request that failed.
  if (isError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this delivery — check your connection and try again.</p>
        <button onClick={() => refetch()} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!delivery) return <div className="p-8 text-red-400">Delivery not found.</div>

  const slips = boxGroups.map(([boxLabel, boxItems]) => ({ boxLabel: boxLabel === 'unassigned' ? null : boxLabel, items: boxItems }))

  // Pair slips up two-per-sheet. An odd one out (or a SJ, which almost
  // always has just one "package") prints alone — DeliverySheetPage only
  // stretch-fills the page when there's an actual pair to split evenly;
  // a lone slip sits at its natural height instead of pushing the
  // signature block all the way to the bottom of an otherwise-empty page.
  const sheets: (typeof slips)[] = []
  for (let i = 0; i < slips.length; i += 2) sheets.push(slips.slice(i, i + 2))

  const showRekapPage = isDO && boxGroups.length > 1
  const boxLabelText = isDO ? 'KODE BOX' : 'KODE PAKET'

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-1.5 text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-400 text-sm flex-1">
          {isDO ? 'Delivery Order' : 'Surat Jalan'} — {delivery.id}
          {slips.length > 1 && ` · ${slips.length} ${isDO ? 'boxes' : 'packages'}`}
        </span>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      <div className="p-8 print:p-0">
        {sheets.map((pair, i) => (
          <DeliverySheetPage
            key={pair.map(p => p.boxLabel ?? 'flat').join('+')}
            delivery={delivery}
            isDO={isDO}
            boxLabelText={boxLabelText}
            slips={pair}
            isLastPage={!showRekapPage && i === sheets.length - 1}
          />
        ))}

        {showRekapPage && (
          <RekapSheet delivery={delivery} boxes={rekapBoxes} grandTotal={grandTotal} />
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .delivery-sheet { width: 100% !important; margin: 0 !important; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
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

// One physical A4 sheet holding up to two box slips, stacked and split by a
// dashed cut line — replaces the old one-slip-per-page layout, which left
// most of the sheet blank for a box with just a handful of items. An
// actual pair splits the full sheet height evenly. A lone slip (no second
// one to pair with — the normal case for a SJ) fills at least half the
// sheet instead: enough to not look like a mostly-blank page, but without
// stretching a short item list all the way to the bottom of a full A4 and
// leaving a huge gap above the signature.
function DeliverySheetPage({
  delivery,
  isDO,
  boxLabelText,
  slips,
  isLastPage,
}: {
  delivery: Delivery
  isDO: boolean
  boxLabelText: string
  slips: { boxLabel: string | null; items: DeliveryItem[] }[]
  isLastPage: boolean
}) {
  const paired = slips.length === 2
  return (
    <div className={`print-page ${isLastPage ? '' : 'mb-8 print:mb-0'}`}>
      <div
        className="delivery-sheet bg-white mx-auto shadow-lg print:shadow-none flex flex-col"
        style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif', color: '#000' }}
      >
        {slips.map((slip, i) => (
          <div
            key={slip.boxLabel ?? 'flat'}
            className={paired ? 'flex-1 flex flex-col' : 'flex flex-col'}
            style={{
              padding: '10mm 15mm',
              borderBottom: i === 0 && paired ? '1px dashed #999' : undefined,
              // Lone slip (not sharing the sheet with a second box/package):
              // reserve at least half the A4 sheet so a short SJ item list
              // doesn't leave the page looking almost empty. A paired slip
              // already gets its half via flex-1 on the parent.
              minHeight: paired ? undefined : '148.5mm',
            }}
          >
            <DeliverySlipContent
              delivery={delivery}
              isDO={isDO}
              boxLabelText={boxLabelText}
              boxLabel={slip.boxLabel}
              items={slip.items}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function DeliverySlipContent({
  delivery,
  isDO,
  boxLabelText,
  boxLabel,
  items,
}: {
  delivery: Delivery
  isDO: boolean
  boxLabelText: string
  boxLabel: string | null
  items: DeliveryItem[]
}) {
  // Items group by name — each name prints once (bold row), with its
  // size/qty variants listed underneath (blank name cell), matching the
  // paper template's "KEMEJA T. PENDEK" rows with S/M/L/XL beneath it.
  const grouped: [string, DeliveryItem[]][] = []
  const buckets = new Map<string, DeliveryItem[]>()
  items.forEach(item => {
    if (!buckets.has(item.item_name)) {
      const bucket: DeliveryItem[] = []
      buckets.set(item.item_name, bucket)
      grouped.push([item.item_name, bucket])
    }
    buckets.get(item.item_name)!.push(item)
  })

  const totalItems = items.reduce((s, i) => s + i.amount, 0)

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <img src="/Logo.png" alt="KMA Logo" style={{ width: '40px', height: 'auto', flexShrink: 0 }} />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '15px', letterSpacing: '0.5px' }}>KREASI MAKMUR ABADI</div>
          <div style={{ fontWeight: 'bold', fontSize: '12px', marginTop: '1px' }}>
            {isDO ? 'DELIVERY ORDER' : 'SURAT JALAN'} NO. {delivery.id}
          </div>
        </div>
      </div>

      {/* Fields — DO uses a two-column grid (it has more fields: box code,
          PO). SJ matches the paper template's single stacked column, with
          the phone number folded into UNTUK rather than its own HP row. */}
      {isDO ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '3px', marginBottom: '10px', fontSize: '10.5px' }}>
          <Field label="TANGGAL D/O" value={delivery.date ? format(new Date(delivery.date), 'd MMM yyyy').toUpperCase() : '—'} />
          <Field label={boxLabelText} value={boxLabel ?? '—'} />
          <Field label="NAMA" value={delivery.company ?? '—'} />
          <Field label="ALAMAT" value={delivery.address || '—'} />
          <Field label="UNTUK" value={delivery.contact_person ?? '—'} />
          {delivery.po_number && <Field label="PO NO" value={delivery.po_number} />}
          <Field label="HP" value={delivery.phone_number ?? '—'} />
        </div>
      ) : (
        <div style={{ marginBottom: '10px', fontSize: '10.5px' }}>
          <Field label="TANGGAL D/O" value={delivery.date ? format(new Date(delivery.date), 'd MMM yyyy').toUpperCase() : '—'} />
          <Field label="NAMA" value={delivery.company ?? '—'} />
          <Field
            label="UNTUK"
            value={`${delivery.contact_person ?? '—'}${delivery.phone_number ? ` (HP: ${delivery.phone_number})` : ''}`}
          />
          <Field label={boxLabelText} value={boxLabel ?? '—'} />
          <Field label="ALAMAT" value={delivery.address || '—'} />
        </div>
      )}

      {isDO ? (
        <>
          {boxLabel && (
            <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '5px', fontSize: '11px' }}>
              {boxLabelText} {boxLabel}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
            <thead>
              <tr style={{ borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>
                <th style={{ padding: '3px' }}>NO</th>
                <th style={{ padding: '3px', textAlign: 'left' }}>DETAILS</th>
                <th style={{ padding: '3px', width: '60px' }}>SIZE</th>
                <th style={{ padding: '3px', width: '70px' }}>QTY / PCS</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([name, variants], idx) => variants.map((v, vi) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #ccc' }}>
                  <td style={{ padding: '2px 3px', textAlign: 'center' }}>{vi === 0 ? idx + 1 : ''}</td>
                  <td style={{ padding: '2px 3px', fontWeight: vi === 0 ? 'bold' : 'normal' }}>{vi === 0 ? name : ''}</td>
                  <td style={{ padding: '2px 3px', textAlign: 'center' }}>{v.size ?? '—'}</td>
                  <td style={{ padding: '2px 3px', textAlign: 'center' }}>{v.amount}</td>
                </tr>
              )))}
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '8px', textAlign: 'center', color: '#888' }}>No items in this box</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1.5px solid #000' }}>
                <td colSpan={3} style={{ padding: '3px', fontWeight: 'bold', textAlign: 'center' }}>
                  TOTAL ITEMS {boxLabel ? `BOX ${boxLabel}` : ''}
                </td>
                <td style={{ padding: '3px', fontWeight: 'bold', textAlign: 'center' }}>{totalItems}</td>
              </tr>
            </tfoot>
          </table>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '5px', fontSize: '11px' }}>ITEMS</div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '10.5px' }}>
            {items.map(item => (
              <li key={item.id} style={{ marginBottom: '3px' }}>
                {item.item_name}{item.amount > 1 ? ` (${item.amount})` : ''}
              </li>
            ))}
            {items.length === 0 && <li style={{ color: '#888', listStyle: 'none', marginLeft: '-18px' }}>No documents listed</li>}
          </ul>
        </>
      )}

      {/* Signatures — anchored to the bottom of whatever space this slip
          has (its half of a paired sheet, or its half-page minHeight when
          solo) via marginTop:auto, so a short item list doesn't leave the
          signature stranded right under it. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '18px', fontSize: '10.5px' }}>
        <div>
          <div>DI KIRIM OLEH :</div>
          <div style={{ height: '32px' }} />
        </div>
        <div>
          <div>DI TERIMA OLEH :</div>
          <div style={{ height: '32px' }} />
        </div>
      </div>
    </>
  )
}

// Final page after all box sheets — every box's items totaled, grouped by
// box (so it reads the same as the physical boxes), then one grand total
// across the whole delivery underneath.
function RekapSheet({
  delivery,
  boxes,
  grandTotal,
}: {
  delivery: Delivery
  boxes: { boxLabel: string | null; rows: { item_name: string; size: string | null; total: number }[]; subtotal: number }[]
  grandTotal: number
}) {
  return (
    <div className="print-page">
      <div
        className="delivery-sheet bg-white mx-auto shadow-lg print:shadow-none"
        style={{ width: '210mm', minHeight: '297mm', padding: '15mm 18mm', fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#000' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <img src="/Logo.png" alt="KMA Logo" style={{ width: '64px', height: 'auto', flexShrink: 0 }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '20px', letterSpacing: '1px' }}>KREASI MAKMUR ABADI</div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', marginTop: '2px' }}>
              REKAP — DELIVERY ORDER NO. {delivery.id}
            </div>
            <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{boxes.length} boxes total</div>
          </div>
        </div>

        {boxes.map(box => (
          <div key={box.boxLabel ?? 'unassigned'} style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
              KODE BOX {box.boxLabel ?? '—'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
                  <th style={{ padding: '5px 6px', textAlign: 'left' }}>DETAILS</th>
                  <th style={{ padding: '5px 6px', width: '90px' }}>SIZE</th>
                  <th style={{ padding: '5px 6px', width: '90px' }}>QTY / PCS</th>
                </tr>
              </thead>
              <tbody>
                {box.rows.map(r => (
                  <tr key={`${r.item_name}|${r.size ?? ''}`} style={{ borderBottom: '1px solid #ccc' }}>
                    <td style={{ padding: '4px 6px' }}>{r.item_name}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.size ?? '—'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid #000' }}>
                  <td colSpan={2} style={{ padding: '4px 6px', fontWeight: 'bold', textAlign: 'center' }}>
                    SUBTOTAL BOX {box.boxLabel ?? '—'}
                  </td>
                  <td style={{ padding: '4px 6px', fontWeight: 'bold', textAlign: 'center' }}>{box.subtotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '8px' }}>
          <tbody>
            <tr style={{ borderTop: '2.5px solid #000', borderBottom: '2.5px solid #000' }}>
              <td style={{ padding: '8px 6px', fontWeight: 'bold', textAlign: 'center' }}>GRAND TOTAL</td>
              <td style={{ padding: '8px 6px', fontWeight: 'bold', textAlign: 'center', width: '90px' }}>{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex' }}>
      <span style={{ width: '90px', flexShrink: 0, fontWeight: 'bold' }}>{label}</span>
      <span>: {value}</span>
    </div>
  )
}