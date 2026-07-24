import { useMemo, useState } from 'react'
import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/components/ui'
import type { Client, ClientItem, ClientItemPrice } from '@/types'

interface ClientPriceListPrintProps {
  client: Client
  items: ClientItem[]
  /** ClientItem.id -> that item's full price history (any order). */
  pricesByItem: Record<number, ClientItemPrice[]>
  onClose: () => void
}

// Full-catalogue price list for one client — the printed sign/handout used
// to announce a price change once material costs push a year's price up.
// Shows each item's latest price next to the year before it, so a hike is
// legible at a glance instead of needing to cross-reference two documents.
// Uses the visibility trick below rather than a dedicated print route,
// since the app has no /clients/:id/print route wired up yet.
export function ClientPriceListPrint({ client, items, pricesByItem, onClose }: ClientPriceListPrintProps) {
  type Row = { item: ClientItem; latest: ClientItemPrice | undefined; previous: ClientItemPrice | undefined }

  const allRows = useMemo(() => {
    return items
      .map((item): Row => {
        const history = [...(pricesByItem[item.id] ?? [])].sort((a, b) => a.year - b.year)
        return { item, latest: history[history.length - 1], previous: history[history.length - 2] }
      })
      .filter((r): r is { item: ClientItem; latest: ClientItemPrice; previous: ClientItemPrice | undefined } => !!r.latest)
      .sort((a, b) => a.item.item_name.localeCompare(b.item.item_name))
  }, [items, pricesByItem])

  // Which items actually go on THIS printed list — a client's full
  // catalogue often includes things they aren't currently ordering, so
  // this narrows the handout to just what's relevant for them right now.
  // Starts with everything checked (matches the old "always full
  // catalogue" behavior); uncheck down to just what's being quoted.
  const [selected, setSelected] = useState<Set<number>>(() => new Set(allRows.map(r => r.item.id)))
  const toggle = (itemId: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
    return next
  })
  const allChecked = selected.size === allRows.length && allRows.length > 0
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allRows.map(r => r.item.id)))

  const rows = allRows.filter(r => selected.has(r.item.id))
  const today = format(new Date(), 'd MMMM yyyy')

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto py-8 print:bg-white print:py-0">
      {/* Self-contained print rule — hides everything except .print-area
          without needing to touch global CSS or add a dedicated route. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl print:shadow-none print:rounded-none print:max-w-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 print:hidden">
          <h2 className="font-display font-semibold text-navy-900">Price List — {client.client_name}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-primary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5">
              <Printer size={15} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Item picker — screen only, not part of the printed sheet. Pick
            just what this client is currently ordering rather than
            dumping the whole catalogue on every handout. */}
        {allRows.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-100 print:hidden">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Items on this list</p>
              <button onClick={toggleAll} className="text-xs text-navy-600 hover:underline">
                {allChecked ? 'Uncheck all' : 'Check all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-32 overflow-y-auto">
              {allRows.map(r => (
                <label key={r.item.id} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={selected.has(r.item.id)} onChange={() => toggle(r.item.id)} />
                  {r.item.item_name}{r.item.size ? ` (${r.item.size})` : ''}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="print-area px-8 py-8">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-mono">Kreasi Makmur Abadi</p>
            <h1 className="text-xl font-display font-bold text-navy-900 mt-1">Price List — {client.client_name}</h1>
            <p className="text-sm text-slate-400 mt-1">{today}</p>
          </div>

          {allRows.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No priced items yet for this client.</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No items checked above — pick at least one to print.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-navy-900">
                  <th className="text-left  py-2 font-semibold text-navy-900 w-14"></th>
                  <th className="text-left  py-2 font-semibold text-navy-900">Item</th>
                  <th className="text-right py-2 font-semibold text-navy-900">Previous</th>
                  <th className="text-right py-2 font-semibold text-navy-900">Current Price</th>
                  <th className="text-right py-2 font-semibold text-navy-900">Effective Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, latest, previous }) => {
                  const changed = previous && previous.price !== latest.price
                  return (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        {item.photo_path ? (
                          <img
                            src={item.photo_path}
                            alt=""
                            className="w-10 h-10 rounded object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-slate-50 border border-slate-100" />
                        )}
                      </td>
                      <td className="py-2 text-navy-900">
                        {item.item_name}
                        {item.size && <span className="text-slate-400"> ({item.size})</span>}
                      </td>
                      <td className="py-2 text-right text-slate-400 font-mono">
                        {previous ? formatRp(previous.price) : '—'}
                        {previous && <span className="block text-[10px] font-normal">{previous.year}</span>}
                      </td>
                      <td className={`py-2 text-right font-mono font-semibold ${changed ? 'text-red-600' : 'text-navy-900'}`}>
                        {formatRp(latest.price)}
                        <span className="block text-[10px] text-slate-400 font-normal">{latest.year}</span>
                      </td>
                      <td className="py-2 text-right text-slate-500 font-mono">
                        {latest.effective_date ? format(new Date(latest.effective_date), 'd MMM yyyy') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <p className="text-xs text-slate-400 mt-8">
            Prices are subject to change based on material costs. Please contact us for the latest quotation.
          </p>
        </div>
      </div>
    </div>
  )
}