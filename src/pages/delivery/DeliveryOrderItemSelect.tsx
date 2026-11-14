import { useTranslation } from 'react-i18next'
import { FormField } from '@/components/ui'
import type { OrderRemainingItem } from '@/hooks'

// Presentational: the parent fetches the remaining items and passes them in.
interface OrderItemSelectProps {
  items: OrderRemainingItem[]
  value: { item_name: string; size: string | null } | null
  onSelect: (item: OrderRemainingItem | null) => void
  missing?: boolean
  label?: string
}

export function OrderItemSelect({ items, value, onSelect, missing, label }: OrderItemSelectProps) {
  const { t } = useTranslation()
  const selectedKey = value ? `${value.item_name}|${value.size ?? ''}` : ''

  return (
    <FormField label={label ?? t('deliveryPicker.item')} required>
      <select
        className={`field ${missing ? '!border-red-400 !ring-red-100 dark:!border-red-500 dark:!ring-red-500/20' : ''}`}
        value={selectedKey}
        onChange={e => {
          if (!e.target.value) { onSelect(null); return }
          const [item_name, size] = e.target.value.split('|')
          const match = items.find(r => r.item_name === item_name && (r.size ?? '') === size)
          onSelect(match ?? null)
        }}
      >
        <option value="">{t('deliveryPicker.select')}</option>
        {items.map(r => {
          const key = `${r.item_name}|${r.size ?? ''}`
          return (
            <option key={key} value={key} disabled={r.remaining <= 0 && key !== selectedKey}>
              {r.item_name}{r.size ? ` (${r.size})` : ''} — {t('deliveryPicker.left', { remaining: r.remaining, amount: r.amount })}
            </option>
          )
        })}
      </select>
      {items.length === 0 && (
        <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">{t('deliveryPicker.noItems')}</p>
      )}
    </FormField>
  )
}