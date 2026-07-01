import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FormField, formatRp } from '@/components/ui'
import { invoicesApi } from '@/api'
import type { Order, Item, Invoice, CreateInvoiceRequest, UpdateInvoiceRequest } from '@/types'

interface Props {
  order: Order
  items: Item[]
  existingInvoice: Invoice | null
  onClose: () => void
}

export function GenerateInvoiceForm({ order, items, existingInvoice, onClose }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const total = items.reduce((s, i) => s + i.sub_total, 0)

  const [dpPercent, setDpPercent] = useState(() => {
    if (existingInvoice && existingInvoice.total > 0) {
      return Math.round(((existingInvoice.down_payment ?? 0) / existingInvoice.total) * 100)
    }
    return 50
  })

  const [form, setForm] = useState({
    id:             existingInvoice?.id             ?? '',
    order_id:       order.id,
    type:           existingInvoice?.type           ?? 'dp',
    kepada_yth:     existingInvoice?.kepada_yth     ?? order.company ?? '',
    untuk:          existingInvoice?.untuk          ?? '',
    alamat:         existingInvoice?.alamat         ?? '',
    email:          existingInvoice?.email          ?? '',
    telp:           existingInvoice?.telp           ?? '',
    start_produksi: existingInvoice?.start_produksi ?? 'Setelah D/P sudah di terima',
    lama_produksi:  existingInvoice?.lama_produksi  ?? '2 - 3 Minggu Hari Kerja (Senin - Jumat)',
    total:          total,
    discount:       existingInvoice?.discount       ?? 0,
    tanggal:        existingInvoice?.tanggal
                      ? new Date(existingInvoice.tanggal).toISOString().split('T')[0]
                      : new Date().toISOString().split('T')[0],
    due_date:       existingInvoice?.due_date
                      ? new Date(existingInvoice.due_date).toISOString().split('T')[0]
                      : '',
    paid_date:      existingInvoice?.paid_date
                      ? new Date(existingInvoice.paid_date).toISOString().split('T')[0]
                      : '',
    status:         existingInvoice?.status         ?? 'unpaid',
  })

  const downPayment = Math.round(form.total * (dpPercent / 100))
  const remaining = form.total - downPayment
  const ar = remaining - (Number(form.discount) ?? 0)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const setNum = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: Number(e.target.value) }))

  const create = useMutation({
    mutationFn: (body: CreateInvoiceRequest) => invoicesApi.create(body),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice created')
      onClose()
      navigate(`/invoice/${encodeURIComponent(inv.id)}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: (body: UpdateInvoiceRequest) => invoicesApi.update(existingInvoice!.id, body),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Invoice updated')
      onClose()
      navigate(`/invoice/${encodeURIComponent(inv.id)}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleSubmit = () => {
    if (!form.id) { toast.error('Invoice ID is required'); return }
    if (!form.kepada_yth) { toast.error('Kepada Yth is required'); return }
    if (!form.untuk) { toast.error('Untuk is required'); return }
    if (!form.alamat) { toast.error('Alamat is required'); return }

    const payload = {
      ...form,
      down_payment:  downPayment,
      remaining,
      ar_receivable: ar,
      email:     form.email || null,
      telp:      form.telp  || null,
      tanggal:   new Date(form.tanggal).toISOString(),
      due_date:  form.due_date  ? new Date(form.due_date).toISOString()  : null,
      paid_date: form.paid_date ? new Date(form.paid_date).toISOString() : null,
    }

    if (existingInvoice) {
      update.mutate(payload as UpdateInvoiceRequest)
    } else {
      create.mutate(payload as CreateInvoiceRequest)
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">

      {existingInvoice && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          Updating existing invoice <span className="font-mono font-semibold">{existingInvoice.id}</span> — total will be recalculated from current items.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Invoice No." required>
          <input className="field font-mono" placeholder="076.1/KMA/26"
            value={form.id} onChange={set('id')}
            disabled={!!existingInvoice} />
        </FormField>
        <FormField label="Down Payment (%)">
          <div className="flex items-center gap-2">
            <input className="field font-mono" type="number" min={0} max={100}
              value={dpPercent} onChange={e => setDpPercent(Number(e.target.value))} />
            <span className="text-slate-400 text-sm shrink-0">%</span>
          </div>
        </FormField>
      </div>

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
              <input className="field" type="email" value={form.email ?? ''} onChange={set('email')} />
            </FormField>
            <FormField label="Telp">
              <input className="field" value={form.telp ?? ''} onChange={set('telp')} />
            </FormField>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Production Info</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Produksi">
            <input className="field" value={form.start_produksi ?? ''} onChange={set('start_produksi')} />
          </FormField>
          <FormField label="Lama Produksi">
            <input className="field" value={form.lama_produksi ?? ''} onChange={set('lama_produksi')} />
          </FormField>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Financials</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Total (Rp)">
            <input className="field font-mono" type="number" value={form.total} onChange={setNum('total')} />
          </FormField>
          <FormField label="Discount (Rp)">
            <input className="field font-mono" type="number" value={form.discount ?? 0} onChange={setNum('discount')} />
          </FormField>
        </div>
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

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dates</p>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Tanggal Invoice">
            <input className="field" type="date" value={form.tanggal} onChange={set('tanggal')} />
          </FormField>
          <FormField label="Due Date (J/T)">
            <input className="field" type="date" value={form.due_date ?? ''} onChange={set('due_date')} />
          </FormField>
          <FormField label="Paid Date">
            <input className="field" type="date" value={form.paid_date ?? ''} onChange={set('paid_date')} />
          </FormField>
        </div>
      </div>

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

      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : existingInvoice ? 'Update Invoice' : 'Generate Invoice'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}