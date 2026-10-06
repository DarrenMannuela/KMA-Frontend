import { formatRp } from '@/components/ui'

// ─── StackedBarChart ─────────────────────────────────────────────────────────
// One bar per category, each split into the same segments (e.g. Paid/Unpaid).
export interface StackedBarSegment {
  key: string
  label: string
  color: string
}

export interface StackedBarDatum {
  /** X-axis label for this bar, e.g. a month name or "This Month". */
  category: string
  /** Segment key → value; missing keys count as 0. */
  values: Partial<Record<string, number>>
}

interface StackedBarChartProps {
  data: StackedBarDatum[]
  segments: StackedBarSegment[]
  height?: number
  onSelectCategory?: (category: string) => void
  selectedCategory?: string | null
  emptyLabel?: string
  /** Caps bar width and centers them, for charts with only a couple of bars. */
  maxBarWidth?: number
}

export function StackedBarChart({
  data, segments, height = 200, onSelectCategory, selectedCategory, emptyLabel = 'No data recorded yet',
  maxBarWidth,
}: StackedBarChartProps) {
  const totals = data.map(d => segments.reduce((s, seg) => s + (d.values[seg.key] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const hasData = totals.some(t => t > 0)

  if (!hasData) {
    return <div className="text-sm text-slate-400 italic py-10 text-center">{emptyLabel}</div>
  }

  return (
    <div>
      <div className={`flex items-end gap-2 ${maxBarWidth ? 'justify-center gap-x-8' : ''}`} style={{ height }}>
        {data.map((d, i) => {
          const total = totals[i]
          const barHeightPct = Math.max(total > 0 ? 3 : 0, (total / max) * 100)
          const isSelected = selectedCategory === d.category
          const Wrapper = onSelectCategory ? 'button' : 'div'
          const nonZeroSegments = segments.filter(seg => (d.values[seg.key] ?? 0) > 0)
          return (
            <Wrapper
              key={d.category}
              // Buttons need type="button" to avoid an implicit submit
              // inside any surrounding form; plain divs don't take it.
              {...(onSelectCategory ? { type: 'button', onClick: () => onSelectCategory(d.category) } : {})}
              className={`relative h-full flex flex-col justify-end items-stretch min-w-0 group ${
                maxBarWidth ? 'flex-none w-full' : 'flex-1'
              } ${onSelectCategory ? 'cursor-pointer' : ''}`}
              style={maxBarWidth ? { maxWidth: maxBarWidth } : undefined}
              title={`${d.category}: ${formatRp(total)}`}
            >
              {/* Tooltip above the column with the total split by segment. */}
              {total > 0 && (
                <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="bg-navy-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 whitespace-nowrap">
                    <div className="font-semibold mb-1">{d.category}</div>
                    <div className="space-y-0.5">
                      {nonZeroSegments.map(seg => (
                        <div key={seg.key} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-navy-300">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} aria-hidden="true" />
                            {seg.label}
                          </span>
                          <span className="font-mono">{formatRp(d.values[seg.key] ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                    {nonZeroSegments.length > 1 && (
                      <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-navy-700 font-semibold">
                        <span>Total</span>
                        <span className="font-mono">{formatRp(total)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div
                className={`w-full flex flex-col rounded-t-md overflow-hidden transition-opacity ${
                  onSelectCategory ? (isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100') : ''
                }`}
                style={{ height: `${barHeightPct}%` }}
              >
                {total <= 0 ? (
                  <div className="w-full h-full bg-slate-100" />
                ) : (
                  segments.map(seg => {
                    const v = d.values[seg.key] ?? 0
                    if (v <= 0) return null
                    return (
                      <div
                        key={seg.key}
                        style={{ height: `${(v / total) * 100}%`, backgroundColor: seg.color }}
                        className="w-full"
                      />
                    )
                  })
                )}
              </div>
              <span className={`text-[10px] mt-1.5 truncate text-center ${isSelected ? 'text-navy-700 font-semibold' : 'text-slate-400'}`}>
                {d.category}
              </span>
            </Wrapper>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 justify-center flex-wrap">
        {segments.map(seg => (
          <span key={seg.key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} aria-hidden="true" />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  )
}