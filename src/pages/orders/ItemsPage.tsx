import { useState, useLayoutEffect, useRef } from 'react'
import { ListOrdered } from 'lucide-react'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp, UppercaseField } from '@/components/ui'
import { itemHooks, orderHooks } from '@/hooks'
import type { Item, CreateItemRequest } from '@/types'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// Same caret-jump problem as the uppercase fields elsewhere (see
// InvoicePrintPage.tsx's useUppercaseField): re-rendering a controlled
// input with a freshly-computed string on every keystroke resets the caret
// to the end unless something restores it. Formatted numbers have it worse
// than a plain uppercase transform, because formatThousands can also
// insert/remove a thousands separator on the very keystroke that changed
// the digit next to it — so the caret can't just be put back at "the same
// index", the separators around it may have shifted. What's stable across
// a reformat is how many DIGITS sit to the left of the caret, so that's
// what gets captured and restored instead of a raw character offset.
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

function ItemForm({ editing, onClose }: { editing: Item | null; onClose: () => void }) {
  const create = itemHooks.useCreate()
  const update = itemHooks.useUpdate()
  const { data: orders = [] } = orderHooks.useList()

  const [form, setForm] = useState<Omit<CreateItemRequest, 'sub_total'>>({
    order_id:  editing?.order_id  ?? '',
    item_name: editing?.item_name ?? '',
    size:      editing?.size      ?? '',
    amount:    editing?.amount    ?? 1,
    price:     editing?.price     ?? 0,
  })

  const subTotal = form.amount * form.price
  const priceField = useFormattedNumberField(form.price, price => setForm(p => ({ ...p, price })))

  const handleSubmit = () => {
    // Size is sent as '' rather than null when blank — see the comment in
    // OrderDetailPage.tsx's ItemForm for why (NULL vs '' in the unique index).
    const payload: CreateItemRequest = { ...form, size: form.size || '', sub_total: subTotal }
    if (editing) {
      update.mutate({ id: editing.id, body: payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-4">
      <FormField label="Order" required>
        <select className="field" value={form.order_id}
          onChange={e => setForm(p => ({ ...p, order_id: e.target.value }))}>
          <option value="">Select order…</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Item Name" required>
          <UppercaseField className="field" placeholder="e.g. Apron" value={form.item_name}
            onChange={v => setForm(p => ({ ...p, item_name: v }))} />
        </FormField>
        <FormField label="Size">
          <UppercaseField className="field" placeholder="e.g. S, M, L, XL" value={form.size ?? ''}
            onChange={v => setForm(p => ({ ...p, size: v }))} />
        </FormField>
        <FormField label="Amount" required>
          {/* Amount counts whole items. type="number" only blocks keyboard
              input, not paste/drag-drop/IME text, so a pasted "12abc" could
              still land in the field. Filtering to digits-only in onChange
              closes that gap regardless of how the character got in. */}
          <input
            className="field"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.amount || ''}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '')
              setForm(p => ({ ...p, amount: digits === '' ? 0 : Math.trunc(Number(digits)) }))
            }}
          />
        </FormField>
        <FormField label="Unit Price (Rp)" required>
          <input className="field font-mono" type="text" inputMode="numeric"
            ref={priceField.ref}
            value={priceField.display}
            onChange={priceField.onChange} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-slate-500">Subtotal</span>
        <span className="font-mono font-semibold text-navy-900">{formatRp(subTotal)}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? 'Saving…' : editing ? 'Update Item' : 'Add Item'}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function ItemsPage() {
  const { data, isLoading } = itemHooks.useList()
  const del = itemHooks.useDelete()

  return (
    <CrudPage<Item>
      title="Order Items"
      icon={ListOrdered}
      data={data}
      isLoading={isLoading}
      searchKeys={['item_name']}
      columns={[
        { header: 'ID',        key: 'id' },
        { header: 'Order ID',  key: 'order_id' },
        { header: 'Item',      key: 'item_name', render: r => <span className="font-medium">{r.item_name}</span> },
        { header: 'Size',      key: 'size',      render: r => r.size ? <span className="badge-slate">{r.size}</span> : '—' },
        { header: 'Qty',       key: 'amount' },
        { header: 'Price',     key: 'price',     render: r => <span className="currency">{formatRp(r.price)}</span> },
        { header: 'Subtotal',  key: 'sub_total', render: r => <span className="currency font-semibold">{formatRp(r.sub_total)}</span> },
      ]}
      formTitle={e => e ? 'Edit Item' : 'Add Item'}
      renderForm={(editing, onClose) => <ItemForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete item "${r.item_name}"?`}
    />
  )
}