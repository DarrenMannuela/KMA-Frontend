import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FormField, formatRp } from '@/components/ui'
import { clientHooks, clientItemHooks } from '@/hooks'
import { useCatalogueBatch } from '@/hooks/catalogue'
import type { ClientItem, ClientItemPrice } from '@/types'
import { adjustPrice, compareSizes, itemKey, itemLabel, yearStart } from './catalogueModel'
import { ChangeFields, noChange } from './RaisePricesDialog'
import { sortPricesByRecency } from '@/utils/PriceHistory'

/** Starts a catalogue from another client's: the items, and optionally their
 *  latest prices (adjusted) as this client's prices for a year. */
export function CopyFromClientDialog({ clientId, catalogue, allPrices, year, onClose }: {
  clientId: number
  catalogue: ClientItem[]
  allPrices: Record<string, ClientItemPrice[]>
  year: number
  onClose: () => void
}) {
  const save = useCatalogueBatch()
  const { data: clients = [] } = clientHooks.useList()
  const [fromId, setFromId] = useState<number | undefined>()
  const theirsQuery = clientItemHooks.useByClient(fromId)
  const theirs = useMemo(() => theirsQuery.data ?? [], [theirsQuery.data])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [withPrices, setWithPrices] = useState(true)
  const [change, setChange] = useState(noChange)
  const [priceYear, setPriceYear] = useState(year)

  // Everything is picked when a client is chosen.
  useEffect(() => setPicked(new Set(theirs.map(i => i.id))), [theirs])

  const existing = useMemo(() => new Set(catalogue.map(i => itemKey(i.item_name, i.size))), [catalogue])
  const rows = useMemo(() => [...theirs]
    .sort((a, b) => a.item_name.localeCompare(b.item_name) || compareSizes(a.size, b.size))
    .map(item => {
      const latest = sortPricesByRecency(allPrices[String(item.id)] ?? [], 'desc')[0]
      return { item, latest, next: latest ? adjustPrice(latest.price, change) : null, there: existing.has(itemKey(item.item_name, item.size)) }
    }), [theirs, allPrices, change, existing])
  const chosen = rows.filter(r => picked.has(r.item.id))
  const allPicked = rows.length > 0 && chosen.length === rows.length
  const toggle = (id: number) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const from = clients.find(c => c.id === fromId)
  const apply = () => save.mutate({
    label: `Copied ${chosen.length} item${chosen.length === 1 ? '' : 's'} from ${from?.client_name}`,
    batch: {
      client_id: clientId,
      upsert_items: chosen.map(r => ({
        item_name: r.item.item_name, size: r.item.size ?? '', notes: r.item.notes,
        prices: withPrices && r.next != null ? [{ year: priceYear, price: r.next, effective_date: yearStart(priceYear) }] : [],
      })),
    },
  }, { onSuccess: onClose })

  return (
    <Modal title="Copy items from another client" onClose={onClose} size="lg">
      <div className="space-y-4">
        <FormField label="From client">
          <select className="field" value={fromId ?? ''} onChange={e => setFromId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Pick a client…</option>
            {clients.filter(c => c.id !== clientId).map(c => <option key={c.id} value={c.id}>{c.client_name}</option>)}
          </select>
        </FormField>

        {fromId && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={withPrices} onChange={e => setWithPrices(e.target.checked)} />
              Copy their latest prices too, as this client's prices for
              <input className="field !w-24 !py-1" type="number" value={priceYear} disabled={!withPrices}
                onChange={e => setPriceYear(Number(e.target.value) || priceYear)} />
            </label>
            {withPrices && <ChangeFields change={change} onChange={setChange} />}

            <div className="border border-slate-100 rounded-xl max-h-[40vh] overflow-y-auto dark:border-navy-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-navy-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" checked={allPicked} aria-label="All"
                        onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.item.id)))} />
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Item</th>
                    <th className="text-right px-3 py-2 font-medium">Their latest</th>
                    {withPrices && <th className="text-right px-3 py-2 font-medium">Here, {priceYear}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-navy-800/60">
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">This client has no catalogue items.</td></tr>
                  )}
                  {rows.map(({ item, latest, next, there }) => (
                    <tr key={item.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => toggle(item.id)}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={picked.has(item.id)} readOnly /></td>
                      <td className="px-3 py-1.5">
                        {itemLabel(item)}
                        {there && <span className="ml-2 badge-amber text-[10px]">already here</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400">
                        {latest ? <>{formatRp(latest.price)} <span className="text-[10px] text-slate-400 dark:text-slate-500">{latest.year}</span></> : '—'}
                      </td>
                      {withPrices && <td className="px-3 py-1.5 text-right font-mono font-semibold text-navy-900 dark:text-slate-100">{next != null ? formatRp(next) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Items already in this catalogue keep their notes; with prices on, their {priceYear} price is set.</p>
          </>
        )}

        <div className="flex gap-2">
          <button className="btn-primary" disabled={!chosen.length || save.isPending} onClick={apply}>
            {save.isPending ? 'Copying…' : `Copy ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
