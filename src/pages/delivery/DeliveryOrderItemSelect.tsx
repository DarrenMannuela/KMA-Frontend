import { FormField } from '@/components/ui'
import type { OrderRemainingItem } from '@/hooks'

// Presentational only — the parent calls useOrderRemainingItems(orderId,
// excludeItemId) itself and passes the result in. Keeping the query out of
// this component means the parent can also read the matching item's
// `remaining` count directly (to cap the Amount field) without a second
// lookup.
interface OrderItemSelectProps {
  items: OrderRemainingItem[]
  value: { item_name: string; size: string | null } | null
  onSelect: (item: OrderRemainingItem | null) => void
  missing?: boolean
  label?: string
}

export function OrderItemSelect({ items, value, onSelect, missing, label = 'Item' }: OrderItemSelectProps) {
  const selectedKey = value ? `${value.item_name}|${value.size ?? ''}` : ''

  return (
    <FormField label={label} required>
      <select
        className={`field ${missing ? '!border-red-400 !ring-red-100' : ''}`}
        value={selectedKey}
        onChange={e => {
          if (!e.target.value) { onSelect(null); return }
          const [item_name, size] = e.target.value.split('|')
          const match = items.find(r => r.item_name === item_name && (r.size ?? '') === size)
          onSelect(match ?? null)
        }}
      >
        <option value="">Select item…</option>
        {items.map(r => {
          const key = `${r.item_name}|${r.size ?? ''}`
          return (
            <option key={key} value={key} disabled={r.remaining <= 0 && key !== selectedKey}>
              {r.item_name}{r.size ? ` (${r.size})` : ''} — {r.remaining} of {r.amount} left
            </option>
          )
        })}
      </select>
      {items.length === 0 && (
        <p className="text-xs text-slate-400 mt-1">This order has no items yet.</p>
      )}
    </FormField>
  )
}