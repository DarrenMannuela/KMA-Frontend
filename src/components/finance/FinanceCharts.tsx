import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ScrollX } from '@/components/ui/ScrollX'
import { formatRp } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'

/** Rupiah in a few characters, the way it's said: 450 rb, 12,5 jt, 1,2 M. */
export function shortRp(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: n < 10 ? 1 : 0 })
  if (a >= 1e9) return `${sign}${fmt(a / 1e9)} M`
  if (a >= 1e6) return `${sign}${fmt(a / 1e6)} jt`
  if (a >= 1e3) return `${sign}${fmt(a / 1e3)} rb`
  return `${sign}${a}`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round axis steps: 1, 2 or 5 × a power of ten. Index-based (not an
 *  accumulating float loop with an epsilon tolerance) so the top tick is
 *  always >= max by construction — the old `v <= max + step * 0.01` loop
 *  could stop one step short of covering max (e.g. min 0, max ~10.19M
 *  picks step 5M, and 10M already satisfies `<= max + 1%`, so the axis
 *  topped out at 10M while a 10.19M bar/line point drew above it, clipped
 *  off the chart). */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? raw
  const first = Math.floor(min / step)
  const last = Math.ceil(max / step)
  const ticks: number[] = []
  for (let i = first; i <= last; i++) ticks.push(Math.round(i * step))
  return ticks
}

const COLORS = { invoiced: '#3e4f8f', cost: '#f59e0b', profit: '#16a34a', loss: '#dc2626', lastYear: '#94a3b8', cashIn: '#16a34a', cashOut: '#ef4444', balance: '#131a32' }

export interface TrendPoint { label: string; invoiced: number; cost: number; profit: number; lastYearProfit?: number }

// Minimum width per data point on a touch/narrow viewport — enough for the
// paired bars and a legible month label without crowding. Below this, the
// chart scrolls horizontally instead of squeezing every month into
// whatever width the phone has (the old behavior: 12 months of paired bars
// crammed into ~300px, bars a couple of pixels wide, labels overlapping).
const MIN_SLOT = 46

/** Invoiced vs spent each month as bars, profit as a line, last year's
 *  profit dashed behind it. Below `dock:`, this scrolls horizontally with
 *  a guaranteed minimum width per month rather than shrinking to fit —
 *  narrower than that and bars/labels stop being readable at all. */
export function TrendChart({ data, selected, onSelect }: { data: TrendPoint[]; selected?: number | null; onSelect?: (i: number) => void }) {
  const { t } = useTranslation()
  const [ref, width] = useWidth<HTMLDivElement>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [hover, setHover] = useState<number | null>(null)
  const height = isMobile ? 220 : 260
  const pad = { l: 52, r: 12, t: 12, b: 26 }
  const cw = isMobile ? Math.max(width, data.length * MIN_SLOT + pad.l + pad.r) : width
  const values = data.flatMap(d => [d.invoiced, d.cost, d.profit, d.lastYearProfit ?? 0])
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values))
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const w = Math.max(0, cw - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo || 1)) * h
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(18, slot * 0.3)
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const line = (key: 'profit' | 'lastYearProfit') => data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${y(d[key] ?? 0)}`).join(' ')
  const active = hover ?? selected ?? null
  const tip = active != null ? data[active] : null

  // Center the scroll on the selected (or most recent) month at first
  // paint, instead of defaulting to January off the left edge — only
  // matters once the chart is actually wider than its container.
  useEffect(() => {
    if (!isMobile || !scrollRef.current || cw <= width) return
    const target = selected ?? data.length - 1
    scrollRef.current.scrollLeft = Math.max(0, cx(target) - scrollRef.current.clientWidth / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, data.length, width])

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <ScrollX ref={scrollRef} style={{ height }}>
          <div className="relative" style={{ width: cw, height }}>
            <svg width={cw} height={height} role="img" aria-label={t('financeCharts.trendAria')}>
              {ticks.map(t => (
                <g key={t}>
                  <line x1={pad.l} x2={cw - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} />
                  <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{shortRp(t)}</text>
                </g>
              ))}
              {data.map((d, i) => (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(i)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
                  <rect x={pad.l + slot * i} y={pad.t} width={slot} height={h} fill={active === i ? '#f8fafc' : 'transparent'} />
                  <rect x={cx(i) - bar - 1} y={Math.min(y(d.invoiced), y(0))} width={bar} height={Math.abs(y(d.invoiced) - y(0))} rx="2" fill={COLORS.invoiced} />
                  <rect x={cx(i) + 1} y={Math.min(y(d.cost), y(0))} width={bar} height={Math.abs(y(d.cost) - y(0))} rx="2" fill={COLORS.cost} />
                  <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={selected === i ? '#131a32' : '#94a3b8'} fontWeight={selected === i ? 600 : 400}>{d.label}</text>
                </g>
              ))}
              {data.some(d => d.lastYearProfit != null) && <path d={line('lastYearProfit')} fill="none" stroke={COLORS.lastYear} strokeWidth="1.5" strokeDasharray="4 4" pointerEvents="none" />}
              <path d={line('profit')} fill="none" stroke={COLORS.profit} strokeWidth="2" pointerEvents="none" />
              {data.map((d, i) => <circle key={i} cx={cx(i)} cy={y(d.profit)} r="3" fill={d.profit < 0 ? COLORS.loss : COLORS.profit} pointerEvents="none" />)}
            </svg>
            {tip && active != null && (
              <div
                className="pointer-events-none absolute top-2 z-10 rounded-lg bg-navy-900 text-white text-xs px-3 py-2 shadow-xl space-y-0.5 whitespace-nowrap"
                style={{ left: Math.min(Math.max(cx(active) - 80, 0), Math.max(0, cw - 180)) }}
              >
                <div className="font-semibold mb-1">{tip.label}</div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.invoiced')}</span><span className="font-mono">{formatRp(tip.invoiced)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.spent')}</span><span className="font-mono">{formatRp(tip.cost)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('common.profit')}</span><span className={`font-mono ${tip.profit < 0 ? 'text-red-300' : 'text-green-300'}`}>{formatRp(tip.profit)}</span></div>
                {tip.lastYearProfit != null && <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.lastYear')}</span><span className="font-mono">{formatRp(tip.lastYearProfit)}</span></div>}
              </div>
            )}
          </div>
        </ScrollX>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.line || i.dashed
            ? <svg width="16" height="6"><line x1="0" x2="16" y1="3" y2="3" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? '4 3' : undefined} /></svg>
            : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export const trendLegend = (t: TFunction) => [
  { label: t('financeCharts.invoiced'), color: COLORS.invoiced },
  { label: t('financeCharts.spent'), color: COLORS.cost },
  { label: t('common.profit'), color: COLORS.profit, line: true },
  { label: t('financeCharts.profitLastYear'), color: COLORS.lastYear, dashed: true },
]

/** Money in (up) and out (down) per bucket, with the running balance. Same
 *  mobile treatment as TrendChart: a guaranteed minimum width per bucket
 *  below `dock:`, scrolling horizontally rather than squeezing every
 *  bucket into whatever width the phone has. */
export function CashFlowChart({ data }: { data: { label: string; cashIn: number; cashOut: number }[] }) {
  const { t } = useTranslation()
  const [ref, width] = useWidth<HTMLDivElement>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [hover, setHover] = useState<number | null>(null)
  const height = isMobile ? 200 : 220
  const pad = { l: 52, r: 12, t: 10, b: 24 }
  const cw = isMobile ? Math.max(width, data.length * MIN_SLOT + pad.l + pad.r) : width
  let running = 0
  const balance = data.map(d => (running += d.cashIn - d.cashOut))
  const ticks = niceTicks(Math.min(0, ...data.map(d => -d.cashOut), ...balance), Math.max(1, ...data.map(d => d.cashIn), ...balance))
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const w = Math.max(0, cw - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo || 1)) * h
  const slot = w / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(22, slot * 0.6))
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const every = Math.ceil(data.length / Math.max(1, Math.floor(w / 44)))
  const tip = hover != null ? data[hover] : null

  useEffect(() => {
    if (!isMobile || !scrollRef.current || cw <= width) return
    scrollRef.current.scrollLeft = Math.max(0, cx(data.length - 1) - scrollRef.current.clientWidth / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, data.length, width])

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <ScrollX ref={scrollRef} style={{ height }}>
          <div className="relative" style={{ width: cw, height }}>
            <svg width={cw} height={height} role="img" aria-label={t('financeCharts.cashAria')}>
              {ticks.map(t => (
                <g key={t}>
                  <line x1={pad.l} x2={cw - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} />
                  <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{shortRp(t)}</text>
                </g>
              ))}
              {data.map((d, i) => (
                <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={pad.l + slot * i} y={pad.t} width={slot} height={h} fill={hover === i ? '#f8fafc' : 'transparent'} />
                  <rect x={cx(i) - bw / 2} y={y(d.cashIn)} width={bw} height={y(0) - y(d.cashIn)} rx="2" fill={COLORS.cashIn} opacity="0.85" />
                  <rect x={cx(i) - bw / 2} y={y(0)} width={bw} height={y(-d.cashOut) - y(0)} rx="2" fill={COLORS.cashOut} opacity="0.85" />
                  {i % every === 0 && <text x={cx(i)} y={height - 7} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>}
                </g>
              ))}
              <path d={balance.map((b, i) => `${i ? 'L' : 'M'}${cx(i)},${y(b)}`).join(' ')} fill="none" stroke={COLORS.balance} strokeWidth="1.75" pointerEvents="none" />
            </svg>
            {tip && hover != null && (
              <div className="pointer-events-none absolute top-1 z-10 rounded-lg bg-navy-900 text-white text-xs px-3 py-2 shadow-xl whitespace-nowrap" style={{ left: Math.min(Math.max(cx(hover) - 80, 0), Math.max(0, cw - 180)) }}>
                <div className="font-semibold mb-1">{tip.label}</div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.in')}</span><span className="font-mono text-green-300">{formatRp(tip.cashIn)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.out')}</span><span className="font-mono text-red-300">{formatRp(tip.cashOut)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-navy-200">{t('financeCharts.balance')}</span><span className="font-mono">{formatRp(balance[hover])}</span></div>
              </div>
            )}
          </div>
        </ScrollX>
      )}
    </div>
  )
}

export const cashLegend = (t: TFunction) => [
  { label: t('financeCharts.paidIn'), color: COLORS.cashIn },
  { label: t('financeCharts.spent'), color: COLORS.cashOut },
  { label: t('financeCharts.runningBalance'), color: COLORS.balance, line: true },
]

/** A ranked list with bars: where the money went. */
export function RankBars({ items, onSelect, empty }: {
  items: { id: string; label: string; value: number; sub?: string; color?: string }[]
  onSelect?: (id: string) => void
  empty?: string
}) {
  const { t } = useTranslation()
  const max = Math.max(1, ...items.map(i => i.value))
  const total = items.reduce((n, i) => n + i.value, 0) || 1
  if (!items.length) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{empty ?? t('financeCharts.nothingInPeriod')}</p>
  return (
    <ul className="space-y-1">
      {items.map(i => (
        <li key={i.id}>
          <button className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-slate-50 group dark:hover:bg-white/5" onClick={() => onSelect?.(i.id)} disabled={!onSelect}>
            <div className="flex items-baseline gap-2 text-sm">
              {i.color && <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: i.color }} />}
              <span className="truncate text-slate-700 group-hover:text-navy-900 dark:text-slate-300 dark:group-hover:text-slate-50">{i.label}</span>
              {i.sub && <span className="text-xs text-slate-500 truncate dark:text-slate-400">{i.sub}</span>}
              <span className="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums text-slate-800 dark:text-slate-200">{formatRp(i.value)}</span>
              <span className="w-10 text-right text-xs text-slate-500 tabular-nums dark:text-slate-400">{Math.round((i.value / total) * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
              <div className="h-full rounded-full bg-navy-500 group-hover:bg-navy-700 transition-colors" style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One bar split into colored parts, with a legend underneath. */
export function SplitBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0)
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-white/10">
        {total > 0 && parts.filter(p => p.value > 0).map(p => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${formatRp(p.value)}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {parts.map(p => (
          <div key={p.key} className="text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.label}</div>
            <div className="font-mono text-slate-800 tabular-nums dark:text-slate-200">{shortRp(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Meter({ value, max }: { value: number; max: number }) {
  const share = max > 0 ? value / max : 0
  const color = share > 1 ? 'bg-red-500' : share > 0.8 ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
    </div>
  )
}

export interface MonthMoney {
  /** Short month label for the axis, e.g. "Okt". */
  label: string
  /** Full name for the hover card and the table, e.g. "Oktober 2026". */
  name: string
  paid: number
  unpaid: number
  production: number
  operations: number
}

/** A bar with its top corners rounded and its foot square on the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/** Several months side by side: what was invoiced (paid, and still unpaid
 *  in stripes) next to what was spent (production, operations), with each
 *  month's profit under it. Hover, tap or focus a month for the full
 *  breakdown; the last month is the current one. One money axis only. */
export function MonthsChart({ data }: { data: MonthMoney[] }) {
  const { t } = useTranslation()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const height = 210
  const pad = { l: 44, r: 6, t: 10, b: 40 }
  const invoiced = data.map(d => d.paid + d.unpaid)
  const costs = data.map(d => d.production + d.operations)
  const ticks = niceTicks(0, Math.max(1, ...invoiced, ...costs), 3)
  const hi = ticks[ticks.length - 1] || 1
  const w = Math.max(0, width - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const y = (v: number) => pad.t + h - (v / hi) * h
  const slot = w / Math.max(1, data.length)
  const bw = Math.max(4, Math.min(16, slot * 0.28))
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const current = data.length - 1
  const shown = active ?? null
  const tip = shown != null ? data[shown] : null
  const GAP = 2 // surface gap between stacked parts

  // One stacked bar: the lower part solid, the upper part solid or striped.
  const stack = (x: number, lower: number, upper: number, lowerFill: string, upperFill: string) => {
    const base = y(0)
    const lowerTop = y(lower)
    const upperTop = y(lower + upper)
    const parts: JSX.Element[] = []
    if (lower > 0) parts.push(<path key="l" d={upper > 0 ? `M${x},${base}V${lowerTop}H${x + bw}V${base}Z` : topRounded(x, lowerTop, bw, base - lowerTop, 3)} fill={lowerFill} />)
    if (upper > 0) {
      const top = lower > 0 ? lowerTop - GAP : base
      parts.push(<path key="u" d={topRounded(x, upperTop, bw, Math.max(1, top - upperTop), 3)} fill={upperFill} />)
    }
    return parts
  }

  const profit = (i: number) => invoiced[i] - costs[i]

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('dashboardChart.aria')} className="overflow-visible">
          <defs>
            {/* Unpaid: the invoiced blue in stripes, money not in yet. */}
            <pattern id="unpaid-stripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="var(--chart-invoiced)" opacity="0.18" />
              <rect width="2.2" height="5" fill="var(--chart-invoiced)" />
            </pattern>
          </defs>
          {ticks.map(v => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--chart-zero)' : 'var(--chart-grid)'} />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--chart-text)">{shortRp(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const p = profit(i)
            const isCurrent = i === current
            return (
              <g
                key={i}
                tabIndex={0}
                role="button"
                aria-label={`${d.name}: ${t('dashboardChart.invoiced')} ${formatRp(invoiced[i])}, ${t('dashboardChart.costs')} ${formatRp(costs[i])}, ${t('common.profit')} ${formatRp(p)}`}
                className="outline-none [&:focus-visible>rect:first-child]:stroke-navy-400"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(a => (a === i ? null : i))}
              >
                {/* The hit target is the whole month, not just the bars. */}
                <rect x={pad.l + slot * i + 1} y={pad.t} width={slot - 2} height={h + pad.b - 2} rx="6"
                  fill={shown === i || (shown == null && isCurrent) ? 'var(--chart-band)' : 'transparent'} strokeWidth="1.5" />
                {stack(cx(i) - bw - 1.5, d.paid, d.unpaid, 'var(--chart-invoiced)', 'url(#unpaid-stripes)')}
                {stack(cx(i) + 1.5, d.production, d.operations, 'var(--chart-production)', 'var(--chart-operations)')}
                <text x={cx(i)} y={height - 23} textAnchor="middle" fontSize="11" fill="var(--chart-text)" fontWeight={isCurrent ? 700 : 400}>{d.label}</text>
                <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="10" fontFamily="DM Mono, monospace"
                  className={p < 0 ? 'fill-red-600 dark:fill-red-400' : 'fill-slate-500 dark:fill-slate-400'}>
                  {invoiced[i] || costs[i] ? `${p > 0 ? '+' : ''}${shortRp(p)}` : '–'}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {tip && shown != null && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg bg-navy-950 text-white text-xs px-3 py-2 shadow-xl whitespace-nowrap ring-1 ring-white/10"
          style={{ top: 0, left: Math.min(Math.max(cx(shown) - 95, 0), Math.max(0, width - 190)) }}
        >
          <div className="font-semibold mb-1.5">{tip.name}</div>
          <div className="grid grid-cols-[auto_auto] gap-x-5 gap-y-0.5">
            <span className="font-medium">{t('dashboardChart.invoiced')}</span><span className="font-mono text-right">{formatRp(invoiced[shown])}</span>
            <span className="text-navy-200 pl-2">{t('common.paid')}</span><span className="font-mono text-right text-navy-100">{formatRp(tip.paid)}</span>
            <span className="text-navy-200 pl-2">{t('common.unpaid')}</span><span className="font-mono text-right text-navy-100">{formatRp(tip.unpaid)}</span>
            <span className="font-medium mt-1">{t('dashboardChart.costs')}</span><span className="font-mono text-right mt-1">{formatRp(costs[shown])}</span>
            <span className="text-navy-200 pl-2">{t('common.production')}</span><span className="font-mono text-right text-navy-100">{formatRp(tip.production)}</span>
            <span className="text-navy-200 pl-2">{t('common.operations')}</span><span className="font-mono text-right text-navy-100">{formatRp(tip.operations)}</span>
            <span className="font-semibold mt-1 pt-1 border-t border-white/15">{profit(shown) < 0 ? t('common.loss') : t('common.profit')}</span>
            <span className={`font-mono font-semibold text-right mt-1 pt-1 border-t border-white/15 ${profit(shown) < 0 ? 'text-red-300' : 'text-green-300'}`}>{formatRp(Math.abs(profit(shown)))}</span>
          </div>
        </div>
      )}
      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>{t('dashboardChart.aria')}</caption>
        <thead><tr><th>{t('common.date')}</th><th>{t('common.paid')}</th><th>{t('common.unpaid')}</th><th>{t('common.production')}</th><th>{t('common.operations')}</th><th>{t('common.profit')}</th></tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{d.name}</td><td>{formatRp(d.paid)}</td><td>{formatRp(d.unpaid)}</td><td>{formatRp(d.production)}</td><td>{formatRp(d.operations)}</td><td>{formatRp(profit(i))}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

/** The key for MonthsChart: a swatch per part, the stripes included. */
export function MonthsLegend() {
  const { t } = useTranslation()
  const item = (label: string, swatch: React.ReactNode) => (
    <span className="inline-flex items-center gap-1.5">{swatch}{label}</span>
  )
  const box = (bg: string) => <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: bg }} aria-hidden />
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      {item(t('common.paid'), box('var(--chart-invoiced)'))}
      {item(t('common.unpaid'), box('repeating-linear-gradient(135deg, var(--chart-invoiced) 0 2px, transparent 2px 4px)'))}
      {item(t('common.production'), box('var(--chart-production)'))}
      {item(t('common.operations'), box('var(--chart-operations)'))}
    </div>
  )
}
