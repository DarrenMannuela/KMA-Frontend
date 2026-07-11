import { formatRp } from '@/components/ui'

interface SpendBarItem {
  id: string | number
  label: string
  value: number
}

interface SpendBarsProps {
  items: SpendBarItem[]
  selectedId?: string | number | null
  onSelect: (id: string | number | null) => void
  emptyLabel?: string
}

export function SpendBars({ items, selectedId, onSelect, emptyLabel = 'No spending recorded yet' }: SpendBarsProps) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-400 italic py-6 text-center">{emptyLabel}</div>
  }

  const max = Math.max(1, ...items.map(i => i.value))
  const sorted = [...items].sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-3">
      {sorted.map(item => {
        const pct = Math.max(2, Math.round((item.value / max) * 100))
        const isSelected = selectedId === item.id
        return (
          <button
            key={item.id}
            onClick={() => onSelect(isSelected ? null : item.id)}
            className="w-full text-left group"
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-navy-200'}`}>
                {item.label}
              </span>
              <span className={`text-sm font-mono font-semibold ${isSelected ? 'text-white' : 'text-navy-200'}`}>
                {formatRp(item.value)}
              </span>
            </div>
            <div className="h-2.5 w-full bg-navy-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isSelected ? 'bg-white' : 'bg-navy-400 group-hover:bg-navy-300'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}