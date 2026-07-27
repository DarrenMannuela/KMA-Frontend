import { formatRp } from '@/components/ui'

// ─── DonutChart ───────────────────────────────────────────────────────────────
// A simple SVG ring chart for showing how a total splits across a small
// number of categories (e.g. Production vs Operations cost). No charting
// library — same hand-rolled approach as SpendBars, just a ring instead of
// horizontal bars, since a composition/proportion question ("what share is
// each part of the whole") reads faster as a donut than as bars.
export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  emptyLabel?: string
}

export function DonutChart({
  segments, size = 160, thickness = 22, centerLabel, centerValue, emptyLabel = 'No spend recorded yet',
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const visibleSegments = segments.filter(seg => seg.value > 0)

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-xs text-slate-400 italic text-center px-6">{emptyLabel}</div>
      </div>
    )
  }

  // Each segment is drawn as a dash on the same circle, offset by the
  // running total of everything drawn before it — standard SVG-circle
  // donut technique. Rotated -90° so the first segment starts at 12
  // o'clock instead of 3 o'clock (reads more like a clock/progress ring).
  let cumulative = 0

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        {visibleSegments.map(seg => {
          const fraction = seg.value / total
          const dash = fraction * circumference
          const offset = cumulative * circumference
          cumulative += fraction
          return (
            <circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {/* Constrained to the ring's actual inner hole (diameter of the
              track's inner edge, minus a little breathing room) —
              without this, a long total (more digits than
              "Rp 19.750.000") can stretch past the hole and spill out
              over the colored ring itself instead of staying inside it.
              Long values also drop to a smaller size rather than
              wrapping/overflowing, since a wrapped 2-line total plus the
              label below often won't fit the hole vertically either. */}
          <div
            className="flex flex-col items-center justify-center text-center px-1"
            style={{ width: (radius - thickness / 2) * 2 - 8 }}
          >
            {centerValue && (
              <span className={`font-bold text-navy-900 leading-tight ${centerValue.length > 12 ? 'text-sm' : 'text-lg'}`}>
                {centerValue}
              </span>
            )}
            {centerLabel && <span className="text-[10px] text-slate-400 uppercase tracking-wide">{centerLabel}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Legend to pair with DonutChart — value + percentage-of-total per segment. */
export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  return (
    <div className="space-y-2.5 min-w-0">
      {segments.map(seg => (
        <div key={seg.key} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} aria-hidden="true" />
            <span className="text-slate-600 truncate">{seg.label}</span>
          </span>
          <span className="font-mono font-semibold text-navy-900 shrink-0">
            {formatRp(seg.value)}
            {total > 0 && (
              <span className="text-slate-400 font-normal ml-1.5 text-xs">
                {Math.round((seg.value / total) * 100)}%
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── DivergingBarChart ────────────────────────────────────────────────────────
// A bar per category that grows UP from a zero baseline when positive and
// DOWN when negative — the standard way to chart a profit/loss trend
// (rather than two separate same-direction bars you have to mentally
// subtract). Used by the Yearly Report's month-by-month P&L instead of
// stacking three different charts that all restate the same Revenue/Cost
// numbers a different way — this shows the number that actually matters
// (the gap between them) directly, once.
export interface DivergingBarDatum {
  category: string
  value: number
}

interface DivergingBarChartProps {
  data: DivergingBarDatum[]
  height?: number
  positiveColor?: string
  negativeColor?: string
  positiveLabel?: string
  negativeLabel?: string
  onSelectCategory?: (category: string) => void
  selectedCategory?: string | null
  emptyLabel?: string
}

export function DivergingBarChart({
  data, height = 220, positiveColor = '#34d399', negativeColor = '#f87171',
  positiveLabel = 'Profit', negativeLabel = 'Loss',
  onSelectCategory, selectedCategory, emptyLabel = 'No data recorded yet',
}: DivergingBarChartProps) {
  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.value)))
  const hasData = data.some(d => d.value !== 0)

  if (!hasData) {
    return <div className="text-sm text-slate-400 italic py-10 text-center">{emptyLabel}</div>
  }

  return (
    <div>
      <div className="flex items-stretch gap-2" style={{ height }}>
        {data.map(d => {
          // Each half (above/below the zero line) gets up to 50% of the
          // available height — a value at maxAbs fills its half
          // entirely, everything else scales proportionally within it.
          const pct = (Math.abs(d.value) / maxAbs) * 100
          const isPositive = d.value >= 0
          const isSelected = selectedCategory === d.category
          const Wrapper = onSelectCategory ? 'button' : 'div'
          return (
            <Wrapper
              key={d.category}
              {...(onSelectCategory ? { type: 'button' as const, onClick: () => onSelectCategory(d.category) } : {})}
              className={`relative flex-1 h-full flex flex-col min-w-0 group ${onSelectCategory ? 'cursor-pointer' : ''}`}
              title={`${d.category}: ${d.value >= 0 ? '+' : '-'}${formatRp(Math.abs(d.value))}`}
            >
              {/* Hover tooltip — anchored to the zero line (vertical
                  center of the bar's own height) so it sits in the same
                  spot whether the bar grows up (profit) or down (loss),
                  instead of jumping around depending on direction. The
                  plain `title` attribute above still covers keyboard/
                  screen-reader access; this is the fast, styled version
                  for mouse users. */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="bg-navy-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 whitespace-nowrap">
                  <div className="font-semibold">{d.category}</div>
                  <div className={`font-mono mt-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : '-'}{formatRp(Math.abs(d.value))}
                    <span className="text-navy-300 font-normal ml-1.5">
                      {isPositive ? positiveLabel : negativeLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-end min-h-0">
                {isPositive && d.value !== 0 && (
                  <div
                    className={`w-full rounded-t-sm transition-opacity ${onSelectCategory ? (isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100') : ''}`}
                    style={{ height: `${pct}%`, backgroundColor: positiveColor }}
                  />
                )}
              </div>
              <div className="w-full h-px bg-slate-300 shrink-0" />
              <div className="flex-1 flex flex-col justify-start min-h-0">
                {!isPositive && d.value !== 0 && (
                  <div
                    className={`w-full rounded-b-sm transition-opacity ${onSelectCategory ? (isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100') : ''}`}
                    style={{ height: `${pct}%`, backgroundColor: negativeColor }}
                  />
                )}
              </div>
              <span className={`text-[10px] mt-1.5 truncate text-center shrink-0 ${isSelected ? 'text-navy-700 font-semibold' : 'text-slate-400'}`}>
                {d.category}
              </span>
            </Wrapper>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 justify-center flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: positiveColor }} aria-hidden="true" />
          {positiveLabel}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: negativeColor }} aria-hidden="true" />
          {negativeLabel}
        </span>
      </div>
    </div>
  )
}
// A small multiple of stacked bars — one bar per category (e.g. one per
// month), each bar split into the same set of segments (e.g. Paid /
// Unpaid). Reused for both a single "this month" bar on the dashboard and
// the 12-month breakdown on the Yearly Report page — same component either
// way, just a different-length `data` array.
export interface StackedBarSegment {
  key: string
  label: string
  color: string
}

export interface StackedBarDatum {
  /** X-axis label for this bar, e.g. a month name or "This Month". */
  category: string
  /** segment key -> value for this bar. Missing keys are treated as 0 —
   *  a bar doesn't need to supply every segment defined in `segments`,
   *  only the ones that actually apply to it (e.g. an "Orders" bar only
   *  has paid/unpaid, not production/operations, when the same chart is
   *  used to compare two different category types side by side). */
  values: Partial<Record<string, number>>
}

interface StackedBarChartProps {
  data: StackedBarDatum[]
  segments: StackedBarSegment[]
  height?: number
  onSelectCategory?: (category: string) => void
  selectedCategory?: string | null
  emptyLabel?: string
  /** Caps each bar's width and centers the group instead of stretching
   *  bars to fill the row with flex-1. Matters when `data` has only a
   *  couple of categories (e.g. the dashboard's 2-bar "Orders vs Costs")
   *  — without a cap those bars blow up to fill half the card each and
   *  read as giant color blocks rather than a chart. Leave unset for the
   *  Yearly Report's 12-bar breakdown, where flex-1 bars are already
   *  narrow and don't need capping. */
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
              {/* Hover tooltip — sits above the whole column (bar + label)
                  so its position doesn't shift bar-to-bar, and breaks the
                  total down by segment instead of just repeating the
                  single number already visible on the bar. Same
                  fast/styled-vs-title-attribute split as DivergingBarChart
                  above. */}
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