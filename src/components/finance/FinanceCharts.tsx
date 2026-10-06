import { useEffect, useRef, useState } from 'react'
import { formatRp } from '@/components/ui'

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

/** Round axis steps: 1, 2 or 5 × a power of ten. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.01; v += step) ticks.push(Math.round(v))
  return ticks
}

const COLORS = { invoiced: '#3e4f8f', cost: '#f59e0b', profit: '#16a34a', loss: '#dc2626', lastYear: '#94a3b8', cashIn: '#16a34a', cashOut: '#ef4444', balance: '#131a32' }

export interface TrendPoint { label: string; invoiced: number; cost: number; profit: number; lastYearProfit?: number }

/** Invoiced vs spent each month as bars, profit as a line, last year's
 *  profit dashed behind it. */
export function TrendChart({ data, selected, onSelect }: { data: TrendPoint[]; selected?: number | null; onSelect?: (i: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 260
  const pad = { l: 52, r: 12, t: 12, b: 26 }
  const values = data.flatMap(d => [d.invoiced, d.cost, d.profit, d.lastYearProfit ?? 0])
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values))
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const w = Math.max(0, width - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo || 1)) * h
  const slot = w / Math.max(1, data.length)
  const bar = Math.min(18, slot * 0.3)
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const line = (key: 'profit' | 'lastYearProfit') => data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${y(d[key] ?? 0)}`).join(' ')
  const active = hover ?? selected ?? null
  const tip = active != null ? data[active] : null

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Invoiced, spent and profit by month">
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} />
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
      )}
      {tip && active != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg bg-navy-900 text-white text-xs px-3 py-2 shadow-xl space-y-0.5 whitespace-nowrap"
          style={{ left: Math.min(Math.max(cx(active) - 80, 0), Math.max(0, width - 180)) }}
        >
          <div className="font-semibold mb-1">{tip.label}</div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">Invoiced</span><span className="font-mono">{formatRp(tip.invoiced)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">Spent</span><span className="font-mono">{formatRp(tip.cost)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">Profit</span><span className={`font-mono ${tip.profit < 0 ? 'text-red-300' : 'text-green-300'}`}>{formatRp(tip.profit)}</span></div>
          {tip.lastYearProfit != null && <div className="flex justify-between gap-4"><span className="text-navy-200">Last year</span><span className="font-mono">{formatRp(tip.lastYearProfit)}</span></div>}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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

export const TREND_LEGEND = [
  { label: 'Invoiced', color: COLORS.invoiced },
  { label: 'Spent', color: COLORS.cost },
  { label: 'Profit', color: COLORS.profit, line: true },
  { label: 'Profit last year', color: COLORS.lastYear, dashed: true },
]

/** Money in (up) and out (down) per bucket, with the running balance. */
export function CashFlowChart({ data }: { data: { label: string; cashIn: number; cashOut: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 220
  const pad = { l: 52, r: 12, t: 10, b: 24 }
  let running = 0
  const balance = data.map(d => (running += d.cashIn - d.cashOut))
  const ticks = niceTicks(Math.min(0, ...data.map(d => -d.cashOut), ...balance), Math.max(1, ...data.map(d => d.cashIn), ...balance))
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const w = Math.max(0, width - pad.l - pad.r)
  const h = height - pad.t - pad.b
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo || 1)) * h
  const slot = w / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(22, slot * 0.6))
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const every = Math.ceil(data.length / Math.max(1, Math.floor(w / 44)))
  const tip = hover != null ? data[hover] : null
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Cash in and out">
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#f1f5f9'} />
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
      )}
      {tip && hover != null && (
        <div className="pointer-events-none absolute top-1 z-10 rounded-lg bg-navy-900 text-white text-xs px-3 py-2 shadow-xl whitespace-nowrap" style={{ left: Math.min(Math.max(cx(hover) - 80, 0), Math.max(0, width - 180)) }}>
          <div className="font-semibold mb-1">{tip.label}</div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">In</span><span className="font-mono text-green-300">{formatRp(tip.cashIn)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">Out</span><span className="font-mono text-red-300">{formatRp(tip.cashOut)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-navy-200">Balance</span><span className="font-mono">{formatRp(balance[hover])}</span></div>
        </div>
      )}
    </div>
  )
}

export const CASH_LEGEND = [
  { label: 'Paid in', color: COLORS.cashIn },
  { label: 'Spent', color: COLORS.cashOut },
  { label: 'Running balance', color: COLORS.balance, line: true },
]

/** A ranked list with bars: where the money went. */
export function RankBars({ items, onSelect, empty = 'Nothing in this period' }: {
  items: { id: string; label: string; value: number; sub?: string; color?: string }[]
  onSelect?: (id: string) => void
  empty?: string
}) {
  const max = Math.max(1, ...items.map(i => i.value))
  const total = items.reduce((n, i) => n + i.value, 0) || 1
  if (!items.length) return <p className="py-8 text-center text-sm text-slate-400">{empty}</p>
  return (
    <ul className="space-y-1">
      {items.map(i => (
        <li key={i.id}>
          <button className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-slate-50 group" onClick={() => onSelect?.(i.id)} disabled={!onSelect}>
            <div className="flex items-baseline gap-2 text-sm">
              {i.color && <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: i.color }} />}
              <span className="truncate text-slate-700 group-hover:text-navy-900">{i.label}</span>
              {i.sub && <span className="text-xs text-slate-400 truncate">{i.sub}</span>}
              <span className="ml-auto font-mono tabular-nums text-slate-800">{formatRp(i.value)}</span>
              <span className="w-10 text-right text-xs text-slate-400 tabular-nums">{Math.round((i.value / total) * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
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
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        {total > 0 && parts.filter(p => p.value > 0).map(p => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${formatRp(p.value)}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {parts.map(p => (
          <div key={p.key} className="text-xs">
            <div className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.label}</div>
            <div className="font-mono text-slate-800 tabular-nums">{shortRp(p.value)}</div>
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
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
    </div>
  )
}
