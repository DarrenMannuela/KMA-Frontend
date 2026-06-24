import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FormField, formatRp } from '@/components/ui'
import { invoicesApi } from '@/api'
import type { Order, Item, CreateInvoiceRequest } from '@/types'

interface Props {
  order: Order
  items: Item[]
  onClose: () => void
}

export function GenerateInvoiceForm({ order, items, onClose }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const total = items.reduce((s, i) => s + i.sub_total, 0)
  const defaultDP = Math.round(total * 0.5)
  const [dpPercent, setDpPercent] = useState(50)

  const [form, setForm] = useState<Omit<CreateInvoiceRequest, 'remaining' | 'ar_receivable'>>({
    id:             '',
    order_id:       order.id,
    type:           'dp',
    kepada_yth:     order.company ?? '',
    untuk:          '',
    alamat:         '',
    email:          '',
    telp:           '',
    start_produksi: 'Setelah D/P sudah di terima',
    lama_produksi:  '2 - 3 Minggu Hari Kerja (Senin - Jumat)',
    total:          total,
    down_payment:   defaultDP,
    discount:       0,
    tanggal:        new Date().toISOString().split('T')[0],
    due_date:       '',
    paid_date:      '',
    status:         'unpaid',
  })

  const downPayment = Math.round(form.total * (dpPercent / 100))
  const remaining = form.total - downPayment
  const ar = remaining - (form.discount ?? 0)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const setNum = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: Number(e.target.value) }))

  const create = useMutation({
    mutationFn: (body: CreateInvoiceRequest) => invoicesApi.create(body),
    onSuccess: (newInvoice) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice created')
      onClose()
      navigate(`/invoice/${encodeURIComponent(newInvoice.id)}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleSubmit = () => {
  if (!form.id) { toast.error('Invoice ID is required'); return }
  if (!form.kepada_yth) { toast.error('Kepada Yth is required'); return }
  if (!form.untuk) { toast.error('Untuk is required'); return }
  if (!form.alamat) { toast.error('Alamat is required'); return }

  const payload: CreateInvoiceRequest = {
    ...form,
    down_payment:  downPayment,
    remaining,
    ar_receivable: ar,
    email:     form.email || null,
    telp:      form.telp  || null,
    // ↓ Convert date strings to full ISO format
    tanggal:   form.tanggal
      ? new Date(form.tanggal as string).toISOString()
      : new Date().toISOString(),
    due_date:  form.due_date  ? new Date(form.due_date as string).toISOString()  : null,
    paid_date: form.paid_date ? new Date(form.paid_date as string).toISOString() : null,
  }
  create.mutate(payload)
}



  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">

      {/* Invoice ID & Type */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Invoice No." required>
          <input className="field font-mono" placeholder="076.1/KMA/26"
            value={form.id} onChange={set('id')} />
        </FormField>
        <FormField label="Down Payment (%)">
          <div className="flex items-center gap-2">
            <input
              className="field font-mono"
              type="number"
              min={0}
              max={100}
              value={dpPercent}
              onChange={e => setDpPercent(Number(e.target.value))}
            />
            <span className="text-slate-400 text-sm shrink-0">%</span>
          </div>
        </FormField>
      </div>

      {/* Client details */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Client Details</p>
        <div className="space-y-3">
          <FormField label="Kepada Yth (Company)" required>
            <input className="field" placeholder="PT. Artisan Kuliner Indonesia"
              value={form.kepada_yth} onChange={set('kepada_yth')} />
          </FormField>
          <FormField label="Untuk (Contact Person)" required>
            <input className="field" placeholder="Ibu Cory"
              value={form.untuk} onChange={set('untuk')} />
          </FormField>
          <FormField label="Alamat" required>
            <textarea className="field" rows={2} placeholder="Jl. Boulevard Pantai Indah Kapuk..."
              value={form.alamat}
              onChange={e => setForm(p => ({ ...p, alamat: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input className="field" type="email" placeholder="purchasing@email.com"
                value={form.email ?? ''} onChange={set('email')} />
            </FormField>
            <FormField label="Telp">
              <input className="field" placeholder="0811.776.002"
                value={form.telp ?? ''} onChange={set('telp')} />
            </FormField>
          </div>
        </div>
      </div>

      {/* Production info */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Production Info</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Produksi">
            <input className="field" placeholder="Setelah D/P sudah di terima"
              value={form.start_produksi ?? ''} onChange={set('start_produksi')} />
          </FormField>
          <FormField label="Lama Produksi">
            <input className="field" placeholder="2 - 3 Minggu Hari Kerja"
              value={form.lama_produksi ?? ''} onChange={set('lama_produksi')} />
          </FormField>
        </div>
      </div>

      {/* Financials */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Financials</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Total (Rp)">
            <input className="field font-mono" type="number" value={form.total}
              onChange={setNum('total')} />
          </FormField>
          <FormField label="Discount (Rp)">
            <input className="field font-mono" type="number" value={form.discount ?? 0}
              onChange={setNum('discount')} />
          </FormField>
        </div>

        {/* Calculated summary */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total</span>
            <span className="font-mono">{formatRp(form.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">D/P ({dpPercent}%)</span>
            <span className="font-mono text-green-700">{formatRp(downPayment)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Remaining</span>
            <span className="font-mono">{formatRp(remaining)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-slate-200 pt-1.5">
            <span>Pelunasan (AR)</span>
            <span className="font-mono text-red-600">{formatRp(ar)}</span>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dates</p>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Tanggal Invoice">
            <input className="field" type="date" value={form.tanggal as string}
              onChange={set('tanggal')} />
          </FormField>
          <FormField label="Due Date (J/T)">
            <input className="field" type="date" value={form.due_date as string ?? ''}
              onChange={set('due_date')} />
          </FormField>
          <FormField label="Paid Date">
            <input className="field" type="date" value={form.paid_date as string ?? ''}
              onChange={set('paid_date')} />
          </FormField>
        </div>
      </div>

      {/* Items preview */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Items on this invoice ({items.length})
        </p>
        <div className="rounded-lg border border-slate-100 overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 text-slate-400">Item</th>
                <th className="text-center p-2 text-slate-400">Size</th>
                <th className="text-right p-2 text-slate-400">Qty</th>
                <th className="text-right p-2 text-slate-400">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t border-slate-50">
                  <td className="p-2">{item.item_name}</td>
                  <td className="p-2 text-center">{item.size ?? '—'}</td>
                  <td className="p-2 text-right">{item.amount}</td>
                  <td className="p-2 text-right font-mono">{formatRp(item.sub_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <button className="btn-primary" disabled={create.isPending} onClick={handleSubmit}>
          {create.isPending ? 'Creating…' : 'Generate Invoice'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
