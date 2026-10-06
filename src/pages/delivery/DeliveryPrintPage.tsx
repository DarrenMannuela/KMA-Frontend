import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { deliveryApi, deliveryItemApi } from '@/api'
import { useScaleToFit } from '@/hooks/useScaleToFit'
import type { Delivery, DeliveryItem } from '@/types'

// The company's paper DO/SJ: letterhead, the field grid, then (DO) one
// "KODE BOX" table per box, grouped by item name; SJ lists its documents.
// Two slips share an A4 sheet split by a cut line; a lone slip takes at least
// half the sheet. The last page is the Rekap, per box with subtotals and a
// grand total.
export function DeliveryPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const deliveryId = decodeURIComponent(id ?? '')

  const { data: delivery, isLoading, isError, refetch } = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => deliveryApi.get(deliveryId),
    enabled: !!deliveryId,
  })

  // Its own query, but in the same loading/error gate: a slip the customer signs
  // must never print empty because this request failed.
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ['delivery-items', deliveryId],
    queryFn: () => deliveryItemApi.list().then(all => all.filter((i: DeliveryItem) => i.delivery_id === deliveryId)),
    enabled: !!deliveryId,
  })

  const isDO = delivery?.type === 'DO'

  // As the on-screen box view; items without a box go in a last group. SJ's
  // "KODE PAKET" is the same box_number.
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

  // The recap per box, with subtotals, so it can be checked box by box.
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

  // Shrinks the preview to fit the screen; printing is unaffected. Called before
  // the early returns (rules of hooks).
  const { containerRef: scaleContainerRef, docRef: scaleDocRef, scale, scaledWidth, scaledHeight } = useScaleToFit(true)

  if (isLoading || itemsLoading) return <div className="p-8 text-slate-400">Loading…</div>
  // A failed fetch (delivery or items) shows Retry, never an empty slip.
  if (isError || itemsError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this delivery — check your connection and try again.</p>
        <button onClick={() => { refetch(); refetchItems() }} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!delivery) return <div className="p-8 text-red-400">Delivery not found.</div>

  const slips = boxGroups.map(([boxLabel, boxItems]) => ({ boxLabel: boxLabel === 'unassigned' ? null : boxLabel, items: boxItems }))

  // Two slips per sheet; an odd one out prints alone at its natural height.
  const sheets: (typeof slips)[] = []
  for (let i = 0; i < slips.length; i += 2) sheets.push(slips.slice(i, i + 2))

  const showRekapPage = isDO && boxGroups.length > 1
  const boxLabelText = isDO ? 'KODE BOX' : 'KODE PAKET'

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
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

      {/* The sheets are a fixed physical width: they scroll (and are scaled to fit,
         as one block) here so they don't widen the toolbar. Printing uses the
         real size. */}
      <div className="p-8 print:p-0 overflow-x-auto print:overflow-visible" ref={scaleContainerRef}>
        <div
          className="scale-wrap"
          style={{ width: scaledWidth || undefined, height: scaledHeight || undefined, overflow: 'hidden' }}
        >
        <div
          ref={scaleDocRef}
          // inline-block so this wrapper shrinks to the 210mm sheets inside it, which is
          // what useScaleToFit needs to measure.
          style={{ display: 'inline-block', transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
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
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .delivery-sheet { width: 100% !important; margin: 0 !important; }
          /* Undo the on-screen scaling when printing. */
          .scale-wrap { width: auto !important; height: auto !important; overflow: visible !important; }
          .scale-wrap > div { transform: none !important; display: block !important; }
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

// One A4 sheet with up to two slips split by a dashed cut line. A pair splits
// the height evenly; a lone slip fills at least half.
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
              // A lone slip takes at least half the sheet.
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
          {/* This branch is only for a Surat Jalan. */}
          <Field label="TANGGAL S/J" value={delivery.date ? format(new Date(delivery.date), 'd MMM yyyy').toUpperCase() : '—'} />
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

      {/* Signatures sit at the bottom of the slip's space (marginTop: auto). */}
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