import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { RotateCcw, Building2 } from 'lucide-react'
import { FormField, formatRp, UppercaseField } from '@/components/ui'
import { invoicesApi } from '@/api'
import { invoiceHooks, clientHooks, clientContactHooks } from '@/hooks'
import type { Order, Item, Invoice, CreateInvoiceRequest, UpdateInvoiceRequest } from '@/types'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// Same convention as Orders' suggestNextOrderId: "NNN/KMA/YY" for the
// current year. Some older invoices in the system use a decimal suffix
// like "076.1/KMA/26" (e.g. to distinguish DP vs Pelunasan on one order) —
// the regex tolerates that trailing ".N" so old data doesn't break the
// "what's the next number" scan, but new suggestions are always plain
// "NNN/KMA/YY".
function suggestNextInvoiceId(invoices: Invoice[]): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)(?:\\.\\d+)?\\/KMA\\/${yy}$`)
  const usedNumbers = invoices
    .map(inv => inv.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(3, '0')}/KMA/${yy}`
}

// Same caret-jump problem as the Unit Price field on the item forms:
// re-rendering a controlled input with a freshly-computed formatted string
// on every keystroke resets the caret to the end unless something restores
// it, and formatThousands can shift the thousands separators around the
// very digit that was just typed/deleted — so what's stable across a
// reformat is how many DIGITS sit to the left of the caret, not a raw
// character offset. Total/Discount are comma-formatted the same way as
// Unit Price, so they need the same fix.
function useFormattedNumberField(value: number, onValueChange: (n: number) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const digitsBeforeCaret = useRef<number | null>(null)
  const display = value ? formatThousands(String(value)) : ''

  useLayoutEffect(() => {
    if (!ref.current || digitsBeforeCaret.current == null) return
    let digits = 0
    let pos = display.length
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i])) digits++
      if (digits === digitsBeforeCaret.current) { pos = i + 1; break }
    }
    if (digitsBeforeCaret.current === 0) pos = 0
    ref.current.setSelectionRange(pos, pos)
  }, [display])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caretPos = e.target.selectionStart ?? raw.length
    digitsBeforeCaret.current = (raw.slice(0, caretPos).match(/\d/g) ?? []).length
    onValueChange(Number(stripCommas(raw)) || 0)
  }

  return { ref, display, onChange }
}

interface Props {
  order: Order
  items: Item[]
  existingInvoice: Invoice | null
  // Which invoice this form is for — set by the caller (OrderDetailPage),
  // not chosen in the UI. There's no "invoice type" selector; whichever
  // button the user clicked (Generate DP / Generate Pelunasan) decides it.
  forcedType: 'dp' | 'pelunasan'
  // When creating a brand-new Pelunasan invoice, we prefill client and
  // production details from the order's existing DP invoice — same
  // client, same production info, just a second document. Null/undefined
  // when generating a DP invoice (nothing to prefill from) or when
  // existingInvoice is already set (editing takes priority).
  prefillFrom?: Invoice | null
  // The order's linked Client (if any) — lets this form pull Alamat from
  // the Client record and offer a Contact picker for Untuk/Telp/Email,
  // the same way OrdersPage/DeliveryPages link to Clients. Null for
  // orders that only have a free-text company.
  clientId: number | null
  onClose: () => void
}

export function GenerateInvoiceForm({ order, items, existingInvoice, forcedType, prefillFrom, clientId, onClose }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: invoices = [] } = invoiceHooks.useList()

  // Only fetched when the order is actually linked to a client — an
  // unlinked order just falls back to typing everything by hand, same as
  // before this existed. useGet's `id` is typed as `string | number` (no
  // `undefined`) since it's the shared CRUD-hook factory, not one of the
  // purpose-built "fetch only if linked" hooks — 0 is never a real client
  // id, so it works as the same "don't fetch yet" sentinel while still
  // satisfying the type, and useGet's internal `enabled: !!id` treats it
  // exactly like undefined would.
  const { data: client } = clientHooks.useGet(clientId ?? 0)
  const { data: contacts = [] } = clientContactHooks.useByClient(clientId ?? undefined)

  const total = items.reduce((s, i) => s + i.sub_total, 0)

  // Kept as a string while the field is being edited — an empty input
  // becomes "" here, not 0, so backspacing to clear the field doesn't
  // instantly get overwritten back to "0" by a controlled re-render
  // before you can type a replacement. Only meaningful for forcedType
  // 'dp'; Pelunasan bypasses this entirely (see downPayment below).
  const [dpPercent, setDpPercent] = useState(() => {
    if (existingInvoice && existingInvoice.total > 0) {
      return String(Math.round(((existingInvoice.down_payment ?? 0) / existingInvoice.total) * 100))
    }
    return '50'
  })
  const dpPercentNum = Math.min(100, Number(dpPercent) || 0)

  const [form, setForm] = useState({
    id:             existingInvoice?.id             ?? '',
    order_id:       order.id,
    type:           forcedType,
    kepada_yth:     existingInvoice?.kepada_yth     ?? prefillFrom?.kepada_yth     ?? order.company ?? '',
    untuk:          existingInvoice?.untuk          ?? prefillFrom?.untuk          ?? '',
    alamat:         existingInvoice?.alamat         ?? prefillFrom?.alamat         ?? '',
    email:          existingInvoice?.email          ?? prefillFrom?.email          ?? '',
    telp:           existingInvoice?.telp           ?? prefillFrom?.telp           ?? '',
    start_produksi: existingInvoice?.start_produksi ?? prefillFrom?.start_produksi ?? 'Setelah D/P sudah di terima',
    lama_produksi:  existingInvoice?.lama_produksi  ?? prefillFrom?.lama_produksi  ?? '2 - 3 Minggu Hari Kerja (Senin - Jumat)',
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

  const [idTouched, setIdTouched] = useState(false)
  const [totalTouched, setTotalTouched] = useState(false)
  // Which Client Contact (if any) was picked to autofill Untuk/Telp/Email
  // — purely to keep the select controlled, same role catalogueItemId
  // plays in OrderDetailPage's item picker. Editing an existing invoice or
  // prefilling from a DP invoice already has real values here, so this
  // starts unset in those cases rather than guessing which contact they
  // came from.
  const [contactId, setContactId] = useState<number | ''>('')

  // Alamat has no other source to prefill from (unlike Kepada Yth, which
  // already defaults from order.company above) — pull it from the linked
  // Client's address once it loads, but only for a brand-new invoice with
  // nothing typed into that field yet, so this never clobbers a saved or
  // prefilled value.
  useEffect(() => {
    if (!existingInvoice && !prefillFrom && !form.alamat && client?.address) {
      setForm(p => (p.alamat ? p : { ...p, alamat: client.address!.toUpperCase() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, existingInvoice, prefillFrom])

  // Picking a contact fills Untuk/Telp/Email directly — an explicit user
  // action, so it overwrites those fields outright (same convention as
  // DeliveryPages' handleContactChange) rather than only filling blanks.
  const handleContactChange = (idStr: string) => {
    const id = idStr ? Number(idStr) : ''
    setContactId(id)
    const contact = contacts.find(c => c.id === id)
    if (!contact) return
    setForm(p => ({
      ...p,
      untuk: contact.name,
      telp: contact.phone_number ?? p.telp,
      email: contact.email ?? p.email,
    }))
  }

  // For a Pelunasan invoice, the amount already covered is exactly what
  // the D/P invoice actually collected — pulled straight from the record
  // (existingInvoice when editing one, prefillFrom when generating a new
  // one off the order's D/P invoice) rather than recomputed from a
  // percentage, which could drift if the order's items/total changed
  // since the D/P was raised. There's nothing to type here; it's just
  // "total minus what's already been paid."
  const alreadyPaidAmount = forcedType === 'pelunasan'
    ? (existingInvoice?.down_payment ?? prefillFrom?.down_payment ?? 0)
    : 0

  const downPayment = forcedType === 'pelunasan'
    ? Math.min(alreadyPaidAmount, form.total)
    : Math.round(form.total * (dpPercentNum / 100))
  const remaining = form.total - downPayment
  // A discount bigger than what's left to collect (or a shrunken order
  // total after the D/P was already raised) would otherwise print a
  // negative "amount due" with no warning — clamp to 0 and flag it
  // instead of silently showing a number that doesn't make sense.
  const arRaw = remaining - (Number(form.discount) ?? 0)
  const ar = Math.max(0, arRaw)
  const discountExceedsRemaining = arRaw < 0

  // form.total was previously set only once, in useState's initializer —
  // which meant if this form auto-opened (e.g. via the pencil-icon deep
  // link from InvoiceListPage) before OrderDetailPage's items query had
  // finished loading, `items` was still [] at mount time and total got
  // permanently locked at 0, even after the real items arrived a moment
  // later. Keep it synced to the live computed total until the user
  // actually types into the field themselves.
  useEffect(() => {
    if (!existingInvoice && !totalTouched) {
      setForm(p => ({ ...p, total }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, existingInvoice])

  // Prefill the suggested next invoice number once the invoice list loads
  // — same pattern as Orders' resetIdSuggestion effect. Only applies to
  // brand-new invoices, and backs off the moment the user types into the
  // field themselves.
  useEffect(() => {
    if (!existingInvoice && !idTouched) {
      setForm(p => ({ ...p, id: suggestNextInvoiceId(invoices) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, existingInvoice])

  const resetIdSuggestion = () => {
    setIdTouched(false)
    setForm(p => ({ ...p, id: suggestNextInvoiceId(invoices) }))
  }

  const idAlreadyExists = invoices.some(inv => inv.id === form.id && inv.id !== existingInvoice?.id)
  const idChanged = !!existingInvoice && form.id !== existingInvoice.id

  // Invoice No., Kepada Yth, Untuk, Alamat, Start Produksi, and Lama
  // Produksi now uppercase via UppercaseField directly, matching the
  // convention used on the Order/Item forms. Email is deliberately
  // excluded — email addresses are conventionally lowercase and forcing
  // case there tends to look wrong even though it's technically valid.
  // `set` is left for the remaining plain fields (dates, discount inputs
  // handled elsewhere).
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(p => ({ ...p, [k]: e.target.value }))
  }

  const setId = (value: string) => {
    setIdTouched(true)
    setForm(p => ({ ...p, id: value }))
  }

  // Total/Discount are comma-formatted as you type (e.g. "11,520,000")
  // while the underlying state stays a plain number, same trick — and same
  // caret-preserving hook — as the Unit Price field on the item forms.
  const totalField = useFormattedNumberField(form.total, total => {
    setTotalTouched(true)
    setForm(p => ({ ...p, total }))
  })
  const discountField = useFormattedNumberField(form.discount, discount => {
    setForm(p => ({ ...p, discount }))
  })

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
    if (idAlreadyExists) { toast.error('An invoice with this ID already exists'); return }
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
      {!existingInvoice && prefillFrom && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-sm text-blue-700">
          Client and production details copied from DP invoice <span className="font-mono font-semibold">{prefillFrom.id}</span> — modify as needed.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Invoice No." required>
          <div className="flex items-center gap-2">
            <UppercaseField className="field font-mono" placeholder="076/KMA/26"
              value={form.id} onChange={setId} />
            {!existingInvoice && (
              <button
                type="button"
                className="btn-ghost btn-sm !px-2 shrink-0"
                title="Reset to suggested next number"
                onClick={resetIdSuggestion}
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
          {idAlreadyExists ? (
            <p className="text-xs text-red-500 mt-1">
              An invoice with this ID already exists — pick a different number.
            </p>
          ) : idChanged ? (
            <p className="text-xs text-amber-600 mt-1">
              Renaming from {existingInvoice!.id}.
            </p>
          ) : !existingInvoice ? (
            <p className="text-xs text-slate-400 mt-1">
              Auto-suggested as next invoice number for {new Date().getFullYear()} — edit if needed.
            </p>
          ) : null}
        </FormField>
        {forcedType === 'dp' ? (
          <FormField label="Down Payment (%)">
            <div className="flex items-center gap-2">
              <input
                className="field font-mono"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={dpPercent}
                onChange={e => setDpPercent(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => setDpPercent(String(dpPercentNum))}
              />
              <span className="text-slate-400 text-sm shrink-0">%</span>
            </div>
            {dpPercentNum === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                0% — this covers the full amount in one invoice. No separate Pelunasan invoice will be offered for this order.
              </p>
            )}
          </FormField>
        ) : (
          <FormField label="Remaining to Collect">
            <input className="field font-mono bg-slate-50 text-slate-500 cursor-not-allowed" readOnly
              value={formatRp(remaining)} />
            <p className="text-xs text-slate-400 mt-1">
              {alreadyPaidAmount > 0
                ? `Total minus the ${formatRp(alreadyPaidAmount)} already collected on the D/P invoice — filled in automatically.`
                : 'No D/P was collected on this order — this covers the full total.'}
            </p>
          </FormField>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client Details</p>
          {client && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <Building2 size={12} /> {client.client_name} — View record
            </button>
          )}
        </div>
        <div className="space-y-3">
          <FormField label="Kepada Yth (Company)" required>
            <UppercaseField className="field" placeholder="PT. Artisan Kuliner Indonesia"
              value={form.kepada_yth} onChange={v => setForm(p => ({ ...p, kepada_yth: v }))} />
          </FormField>
          {clientId && contacts.length > 0 && (
            <FormField label="Contact (optional)">
              <select className="field" value={contactId} onChange={e => handleContactChange(e.target.value)}>
                <option value="">Select a contact to autofill…</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.role ? ` — ${c.role}` : ''}{c.is_primary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Fills in Untuk, Telp, and Email below — still editable, or leave unpicked to type them directly.
              </p>
            </FormField>
          )}
          <FormField label="Untuk (Contact Person)" required>
            <UppercaseField className="field" placeholder="Ibu Cory"
              value={form.untuk} onChange={v => setForm(p => ({ ...p, untuk: v }))} />
          </FormField>
          <FormField label="Alamat" required>
            <UppercaseField as="textarea" className="field" rows={2} placeholder="Jl. Boulevard Pantai Indah Kapuk..."
              value={form.alamat}
              onChange={v => setForm(p => ({ ...p, alamat: v }))} />
            {/* The auto-fill effect above only ever runs once for a brand
                new invoice — it deliberately never overwrites an existing
                invoice's saved Alamat, since the client's address may have
                changed since. This is the escape hatch for that case: a
                one-click pull instead of a silent overwrite, shown only
                when there's actually something new to pull in. */}
            {client?.address && client.address.toUpperCase() !== form.alamat && (
              <button
                type="button"
                className="text-xs text-navy-600 hover:underline mt-1"
                onClick={() => setForm(p => ({ ...p, alamat: client.address!.toUpperCase() }))}
              >
                Use client's current address: "{client.address.toUpperCase()}"
              </button>
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input className="field" type="email" value={form.email ?? ''} onChange={set('email')} />
            </FormField>
            <FormField label="Telp">
              <UppercaseField className="field" value={form.telp ?? ''}
                onChange={v => setForm(p => ({ ...p, telp: v }))} />
            </FormField>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Production Info</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Produksi">
            <UppercaseField className="field" value={form.start_produksi ?? ''}
              onChange={v => setForm(p => ({ ...p, start_produksi: v }))} />
          </FormField>
          <FormField label="Lama Produksi">
            <UppercaseField className="field" value={form.lama_produksi ?? ''}
              onChange={v => setForm(p => ({ ...p, lama_produksi: v }))} />
          </FormField>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Financials</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Total (Rp)">
            <input className="field font-mono" type="text" inputMode="numeric"
              ref={totalField.ref} value={totalField.display} onChange={totalField.onChange} />
          </FormField>
          <FormField label="Discount (Rp)">
            <input className="field font-mono" type="text" inputMode="numeric"
              ref={discountField.ref} value={discountField.display} onChange={discountField.onChange} />
            {discountExceedsRemaining && (
              <p className="text-xs text-red-500 mt-1">
                Discount is larger than the {formatRp(remaining)} left to collect — Pelunasan (AR) has been floored to Rp 0.
              </p>
            )}
          </FormField>
        </div>
        <div className="bg-slate-50 rounded-lg px-4 py-3 mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total</span>
            <span className="font-mono">{formatRp(form.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">
              {forcedType === 'dp' ? `D/P (${dpPercentNum}%)` : 'Already Paid (D/P)'}
            </span>
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
        <button className="btn-primary" disabled={busy || idAlreadyExists} onClick={handleSubmit}>
          {busy ? 'Saving…' : existingInvoice ? 'Update Invoice' : 'Generate Invoice'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}