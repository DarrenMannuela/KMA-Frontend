import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { FormField, formatRp } from '@/components/ui'
import { useCatalogueBatch } from '@/hooks/catalogue'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import type { ClientItem, ClientItemPrice } from '@/types'
import {
  adjustPrice, compareSizes, itemLabel, pctChange, priceBefore, priceIn, yearStart, ROUNDINGS, type Change,
} from './catalogueModel'

/** By how much: a percentage or a rupiah amount, and what to round up to. */
export function ChangeFields({ change, onChange }: { change: Change & { text: string }; onChange: (c: Change & { text: string }) => void }) {
  const setText = (text: string) => {
    const clean = change.mode === 'pct' ? text.replace(/[^\d.-]/g, '') : (text.trim().startsWith('-') ? '-' : '') + stripCommas(text)
    onChange({ ...change, text: clean, amount: Number(clean) || 0 })
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <FormField label="Change by">
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm dark:border-navy-700">
          {(['pct', 'rp'] as const).map(m => (
            <button key={m} type="button" onClick={() => onChange({ ...change, mode: m, text: '', amount: 0 })}
              className={`flex-1 py-2 ${change.mode === m ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-white/5'}`}>
              {m === 'pct' ? 'Percent' : 'Rupiah'}
            </button>
          ))}
        </div>
      </FormField>
      <FormField label={change.mode === 'pct' ? 'Percent (minus for a cut)' : 'Amount (minus for a cut)'}>
        <input className="field font-mono" inputMode="decimal" autoFocus
          placeholder={change.mode === 'pct' ? 'e.g. 10' : 'e.g. 5,000'}
          value={change.mode === 'pct' ? change.text : (change.text.startsWith('-') ? '-' : '') + formatThousands(change.text.replace('-', ''))}
          onChange={e => setText(e.target.value)} />
      </FormField>
      <FormField label="Round up to">
        <select className="field" value={change.roundTo} onChange={e => onChange({ ...change, roundTo: Number(e.target.value) })}>
          {ROUNDINGS.map(r => <option key={r} value={r}>{r ? formatRp(r) : 'No rounding'}</option>)}
        </select>
      </FormField>
    </div>
  )
}

export const noChange = (): Change & { text: string } => ({ mode: 'pct', amount: 0, roundTo: 1000, text: '' })

/** New prices for a year, worked out from each item's last price. */
export function RaisePricesDialog({ clientId, items, pricesByItem, defaultYear, onClose }: {
  clientId: number
  /** The selected items, or the whole catalogue. */
  items: ClientItem[]
  pricesByItem: Record<number, ClientItemPrice[]>
  defaultYear: number
  onClose: () => void
}) {
  const save = useCatalogueBatch()
  const [change, setChange] = useState(noChange)
  const [year, setYear] = useState(defaultYear)
  const [from, setFrom] = useState(() => yearStart(defaultYear).slice(0, 10))
  const [fromTouched, setFromTouched] = useState(false)
  const setTargetYear = (y: number) => {
    setYear(y)
    if (!fromTouched) setFrom(yearStart(y).slice(0, 10))
  }

  const plan = useMemo(() => items
    .map(item => {
      const base = priceBefore(pricesByItem[item.id], year)
      const current = priceIn(pricesByItem[item.id], year)
      return { item, base, current, next: base ? adjustPrice(base.price, change) : null }
    })
    .sort((a, b) => a.item.item_name.localeCompare(b.item.item_name) || compareSizes(a.item.size, b.item.size)),
  [items, pricesByItem, year, change])
  const priced = plan.filter(p => p.next != null)
  const skipped = plan.length - priced.length
  const replacing = priced.filter(p => p.current).length

  const apply = () => save.mutate({
    label: `Set ${priced.length} price${priced.length === 1 ? '' : 's'} for ${year}`,
    batch: {
      client_id: clientId,
      set_prices: priced.map(p => ({
        client_item_id: p.item.id, year, price: p.next!, effective_date: from ? new Date(from).toISOString() : null,
      })),
    },
  }, { onSuccess: onClose })

  return (
    <Modal title={`Raise prices: ${items.length} item${items.length === 1 ? '' : 's'}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <ChangeFields change={change} onChange={setChange} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="New prices for year">
            <input className="field" type="number" value={year} onChange={e => setTargetYear(Number(e.target.value) || year)} />
          </FormField>
          <FormField label="From date">
            <input className="field" type="date" value={from} onChange={e => { setFrom(e.target.value); setFromTouched(true) }} />
          </FormField>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Each item starts from its last price before {year}.
          {replacing > 0 && <> {replacing} already {replacing === 1 ? 'has a' : 'have'} {year} price, which will be replaced.</>}
          {skipped > 0 && <> {skipped} with no earlier price {skipped === 1 ? 'is' : 'are'} left out.</>}
        </p>

        <div className="border border-slate-100 rounded-xl max-h-[45vh] overflow-auto dark:border-navy-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-navy-950 dark:text-slate-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-right px-3 py-2 font-medium">Now</th>
                <th className="px-1" />
                <th className="text-right px-3 py-2 font-medium">{year}</th>
                <th className="text-right px-3 py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-navy-800/60">
              {plan.map(({ item, base, current, next }) => {
                const pct = base && next != null ? pctChange(base.price, next) : null
                return (
                  <tr key={item.id} className={next == null ? 'text-slate-300 dark:text-navy-700' : ''}>
                    <td className="px-3 py-1.5">{itemLabel(item)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400">
                      {base ? <>{formatRp(base.price)} <span className="text-[10px] text-slate-400 dark:text-slate-500">{base.year}</span></> : 'no price'}
                    </td>
                    <td className="px-1 text-slate-300 dark:text-navy-700"><ArrowRight size={12} /></td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-navy-900 dark:text-slate-100">
                      {next != null ? formatRp(next) : '—'}
                      {current && current.price !== next && (
                        <span className="block text-[10px] font-normal text-amber-600 dark:text-amber-400">replaces {formatRp(current.price)}</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-right text-xs ${pct == null ? 'text-slate-300 dark:text-navy-700' : pct > 0 ? 'text-green-700 dark:text-green-400' : pct < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      {pct == null ? '' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Stacked full-width on mobile, not a side-by-side row: the primary
           button's label is dynamic ("Save 12 prices for 2027") and can run
           long enough to cramp against Cancel on a phone-width modal. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn-primary justify-center" disabled={!priced.length || save.isPending} onClick={apply}>
            {save.isPending ? 'Saving…' : `Save ${priced.length} price${priced.length === 1 ? '' : 's'} for ${year}`}
          </button>
          <button className="btn-secondary justify-center" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
