import { useState, useLayoutEffect, useRef } from 'react'
import { ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CrudPage } from '@/components/ui/CrudPage'
import { FormField, formatRp, UppercaseField } from '@/components/ui'
import { itemHooks, orderHooks } from '@/hooks'
import type { Item, CreateItemRequest } from '@/types'
import { stripCommas, formatThousands } from '@/utils/NumberFormat'

// Keeps the caret in place while thousands separators come and go, by
// restoring how many digits are to its left.
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
  const { t } = useTranslation()
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
      <FormField label={t('items.form.order')} required>
        <select className="field" value={form.order_id}
          onChange={e => setForm(p => ({ ...p, order_id: e.target.value }))}>
          <option value="">{t('items.form.selectOrder')}</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.company}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t('items.form.itemName')} required>
          <UppercaseField className="field" placeholder={t('items.form.itemNamePlaceholder')} value={form.item_name}
            onChange={v => setForm(p => ({ ...p, item_name: v }))} />
        </FormField>
        <FormField label={t('items.form.size')}>
          <UppercaseField className="field" placeholder={t('items.form.sizePlaceholder')} value={form.size ?? ''}
            onChange={v => setForm(p => ({ ...p, size: v }))} />
        </FormField>
        <FormField label={t('items.form.amount')} required>
          {/* Whole items only; onChange also filters pasted text. */}
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
        <FormField label={t('items.form.unitPrice')} required>
          <input className="field font-mono" type="text" inputMode="numeric"
            ref={priceField.ref}
            value={priceField.display}
            onChange={priceField.onChange} />
        </FormField>
      </div>
      <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center dark:bg-navy-950">
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('items.form.subtotal')}</span>
        <span className="font-mono font-semibold text-navy-900 dark:text-slate-50">{formatRp(subTotal)}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? t('common.saving') : editing ? t('items.form.updateItem') : t('items.form.addItem')}
        </button>
        <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

export function ItemsPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = itemHooks.useList()
  // The client name for an item comes from its order's company.
  const { data: orders = [] } = orderHooks.useList()
  const del = itemHooks.useDelete()

  const clientNameByOrderId = new Map(orders.map(o => [o.id, o.company]))

  return (
    <CrudPage<Item>
      title={t('items.title')}
      icon={ListOrdered}
      data={data}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['item_name']}
      columns={[
        { header: t('items.columns.orderId'),  key: 'order_id', secondary: true, render: r => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.order_id}</span> },
        // A key of its own, distinct from the Order ID column's.
        { header: t('items.columns.client'),    key: 'client',   secondary: true, render: r => clientNameByOrderId.get(r.order_id) ?? '—' },
        { header: t('items.columns.item'),      key: 'item_name', primary: true, render: r => <span className="font-medium">{r.item_name}</span> },
        { header: t('items.columns.size'),      key: 'size',      render: r => r.size ? <span className="badge-slate">{r.size}</span> : '—' },
        { header: t('items.columns.qty'),       key: 'amount' },
        { header: t('items.columns.price'),     key: 'price',     secondary: true, render: r => <span className="currency">{formatRp(r.price)}</span> },
        { header: t('items.columns.subtotal'),  key: 'sub_total', render: r => <span className="currency font-semibold">{formatRp(r.sub_total)}</span> },
      ]}
      formTitle={e => e ? t('items.formTitleEdit') : t('items.formTitleNew')}
      renderForm={(editing, onClose) => <ItemForm editing={editing} onClose={onClose} />}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => t('items.deleteConfirm', { name: r.item_name })}
    />
  )
}