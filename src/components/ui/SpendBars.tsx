import { formatRp } from '@/components/ui'

interface SpendBarItem {
  id: string | number
  label: string
  value: number
  /** Optional badge shown next to the label — e.g. the supplier's category
   *  (Sablon, Embroidery, ...). Also helps disambiguate two suppliers that
   *  happen to share a name but differ in category. */
  category?: string
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
              <span className="flex items-baseline gap-2 min-w-0">
                <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-navy-200'}`}>
                  {item.label}
                </span>
                {item.category && (
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-navy-800 text-navy-300'
                    }`}
                  >
                    {item.category}
                  </span>
                )}
              </span>
              <span className={`text-sm font-mono font-semibold shrink-0 ${isSelected ? 'text-white' : 'text-navy-200'}`}>
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