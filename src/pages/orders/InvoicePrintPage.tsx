import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { invoicesApi, ordersApi, itemsApi } from '@/api'
import { formatRp } from '@/components/ui'

function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—'
  return format(new Date(date), 'd-MMM-yy')
}

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const invoiceId = decodeURIComponent(id ?? '')

  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
    enabled: !!invoiceId,
  })

  const { data: order } = useQuery({
    queryKey: ['order', invoice?.order_id],
    queryFn: () => ordersApi.get(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['items', invoice?.order_id],
    queryFn: () => itemsApi.getByOrder(invoice!.order_id),
    enabled: !!invoice?.order_id,
  })

  if (invoiceLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!invoice) return <div className="p-8 text-red-400">Invoice not found.</div>

  const dpPercent = invoice.total > 0
    ? Math.round(((invoice.down_payment ?? 0) / invoice.total) * 100)
    : 50

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
        <span className="text-slate-400 text-sm flex-1">{invoice.id}</span>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Invoice document */}
      <div className="p-8 print:p-0">
        <div
          id="invoice"
          className="bg-white mx-auto shadow-lg print:shadow-none"
          style={{ width: '210mm', minHeight: '297mm', padding: '20mm 20mm 15mm 20mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#000' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <img src="/Logo.png" alt="KMA Logo" style={{ width: '80px', height: 'auto', marginBottom: '6px' }} />
              <div style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }}>KREASI  MAKMUR  ABADI</div>
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', margin: '20px 0 24px' }}>
            INVOICE
          </div>

          {/* Client + Invoice Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginBottom: '24px' }}>
            {/* Left — client info */}
            <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>KEPADA YTH</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.kepada_yth}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>UNTUK</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.untuk}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', verticalAlign: 'top' }}>ALAMAT</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.alamat}</td>
                </tr>
                {invoice.email && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>Email</td>
                    <td style={{ paddingBottom: '4px', color: '#1a56db' }}>{invoice.email}</td>
                  </tr>
                )}
                {invoice.telp && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px' }}>Telp</td>
                    <td>{invoice.telp}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Right — invoice meta */}
            <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>TANGGAL</td>
                  <td style={{ paddingBottom: '4px' }}>{formatDate(invoice.tanggal)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>INVOICE No.</td>
                  <td style={{ paddingBottom: '4px' }}>{invoice.id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px' }}>PO No.</td>
                  <td style={{ paddingBottom: '4px' }}>{order?.po_number ?? '—'}</td>
                </tr>
                {invoice.start_produksi && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>START PRODUKSI</td>
                    <td style={{ paddingBottom: '4px' }}>{invoice.start_produksi}</td>
                  </tr>
                )}
                {invoice.lama_produksi && (
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingRight: '12px' }}>LAMA PRODUKSI</td>
                    <td>{invoice.lama_produksi}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', width: '40px' }}>NO.</th>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'left' }}>KETERANGAN</th>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', width: '60px' }}>SIZE</th>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', width: '60px' }}>QTY</th>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', width: '90px' }}>HARGA NET</th>
                <th style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', width: '100px' }}>JUMLAH (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {/* Company name row */}
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center' }}>1</td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', fontWeight: 'bold', fontStyle: 'italic' }}>
                  {invoice.kepada_yth.toUpperCase()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
              </tr>

              {/* Item rows */}
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px' }}>{item.item_name.toUpperCase()}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.size ?? '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center' }}>{item.amount.toLocaleString('id-ID')}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right' }}>{item.price.toLocaleString('id-ID')}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right' }}>{item.sub_total.toLocaleString('id-ID')}</td>
                </tr>
              ))}

              {/* Spacer row */}
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} colSpan={6} />
              </tr>

              {/* Total row */}
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} colSpan={3} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                  {items.reduce((s, i) => s + i.amount, 0).toLocaleString('id-ID')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                  {invoice.total.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* DP row */}
              {invoice.down_payment != null && (
                <tr>
                  <td style={{ padding: '6px 8px', textAlign: 'right', borderTop: '1px solid #ccc' }} colSpan={3}>
                    {invoice.due_date ? `LUNAS - ${format(new Date(invoice.due_date), 'd MMMM yyyy').toUpperCase()}` : 'LUNAS'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                    D/P {dpPercent} %
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                    {(invoice.down_payment ?? 0).toLocaleString('id-ID')}
                  </td>
                </tr>
              )}

              {/* Pelunasan row */}
              <tr>
                <td style={{ padding: '6px 8px', textAlign: 'right' }} colSpan={3}>
                  {invoice.paid_date ? `J/T : ${format(new Date(invoice.paid_date), 'd MMMM yyyy').toUpperCase()}` : ''}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px' }} />
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: '#d4e6c3' }}>
                  PELUNASAN
                </td>
                <td style={{ border: '1px solid #ccc', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: '#d4e6c3' }}>
                  {invoice.remaining.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          <div style={{ marginTop: '24px', fontSize: '11px' }}>
            <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '4px' }}>CATATAN :</div>
            <ol style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.8' }}>
              <li>Barang akan di proses setelah mock up sudah di ACC dan saat D/P 50% sudah masuk</li>
              <li>Barang akan di kirim sesuai PO</li>
              <li>Saat pengiriman  barang harus membawa PO</li>
              <li>Pembayaran 1 minggu saat pelunasan</li>
              <li>Tanggal Pengiriman : 2 - 3 minggu hari kerja setelah di terima D/P</li>
              <li>Pembayaran via transfer ke rekening a/n :<br />
                &nbsp;&nbsp;&nbsp;&nbsp;FIFI LESMANA TJHIA<br />
                &nbsp;&nbsp;&nbsp;&nbsp;BCA PLUIT SAMUDRA<br />
                &nbsp;&nbsp;&nbsp;&nbsp;<strong>No Rek. 602.002.4389</strong>
              </li>
            </ol>
          </div>

          {/* Signature block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', fontSize: '11px' }}>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '60px' }}>ASLI INVOICE DI TERIMA OLEH</div>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', width: '200px' }} />
              <div>TANDA TANGAN</div>
              <div style={{ marginTop: '4px' }}>NAMA JELAS</div>
              <div>JABATAN</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '60px' }}>DI BUAT OLEH</div>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', display: 'inline-block', width: '200px' }} />
              <div>FIFI LESMANA</div>
              <div>FOUNDER</div>
              <div style={{ fontWeight: 'bold' }}>KREASI MAKMUR ABADI</div>
            </div>
          </div>

          {/* Copy labels */}
          <div style={{ marginTop: '24px', fontSize: '10px' }}>
            {[['Asli', 'Client'], ['Copy 1', 'KMA'], ['Copy 2', 'Produksi KMA']].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '60px 12px 1fr', marginBottom: '2px' }}>
                <span style={{ color: '#c0392b' }}>{label}</span>
                <span>:</span>
                <span style={{ color: '#1a56db' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '10px' }}>
            <div>MUARA KARANG BLOK 9 SELATAN NO. 52 - 55 , JAKARTA UTARA 14450</div>
            <div>TELP. 021.300.253.99 / Hp. 0811.857.372</div>
            <div>Email : fifi67@yahoo.com</div>
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
          #invoice { width: 100% !important; margin: 0 !important; }
          @page { size: A4; margin: 0; }
          
          /* ← Add these to hide sidebar and topbar when printing */
          aside { display: none !important; }
          header { display: none !important; }
          .ml-\\[240px\\] { margin-left: 0 !important; }
          nav { display: none !important; }
        }
      `}</style>
    </div>
  )
}
