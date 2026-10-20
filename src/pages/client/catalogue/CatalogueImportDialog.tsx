import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileSpreadsheet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatRp } from '@/components/ui'
import { catalogueApi } from '@/api'
import { recordCatalogue } from '@/hooks/catalogue'
import { parseDelimited, type Grid } from '@/utils/tableText'
import { readXlsx } from '@/utils/xlsx'
import type { CatalogueBatch, CatalogueBatchResult, ClientItem, ClientItemPrice } from '@/types'
import { itemKey, priceIn, readCatalogueGrid, yearStart, type ImportRow } from './catalogueModel'

const CHUNK = 1500 // items + prices per request, under the server's 2000

interface Planned extends ImportRow {
  /** The catalogue item this row matched. */
  item: ClientItem | undefined
  isNew: boolean
  /** The prices that differ from what's saved. */
  changes: { year: number; price: number; was: number | null }[]
}

/** Brings in an edited export (or any sheet with Item, Size and year
 *  columns): new items are added and changed prices saved; the rest is left. */
export function CatalogueImportDialog({ clientId, clientName, catalogue, pricesByItem, onClose }: {
  clientId: number
  clientName: string
  catalogue: ClientItem[]
  pricesByItem: Record<number, ClientItemPrice[]>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [grid, setGrid] = useState<Grid | null>(null)
  const [fileName, setFileName] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    try {
      if (/\.xlsx$/i.test(file.name)) setGrid(await readXlsx(await file.arrayBuffer()))
      else if (/\.xls$/i.test(file.name)) return toast.error('Old .xls files can’t be read: save it as .xlsx or .csv first')
      else setGrid(parseDelimited(await file.text()))
      setFileName(file.name)
    } catch (e) {
      toast.error(`Couldn't read ${file.name}: ${(e as Error).message}`)
    }
  }

  const read = useMemo(() => (grid ? readCatalogueGrid(grid) : null), [grid])
  const plan = useMemo((): Planned[] => {
    if (!read || 'error' in read) return []
    const byKey = new Map(catalogue.map(i => [itemKey(i.item_name, i.size), i]))
    // A row repeated in the sheet counts once (the last one).
    const rows = new Map(read.rows.map(r => [itemKey(r.name, r.size), r]))
    return [...rows.values()].map(r => {
      const item = byKey.get(itemKey(r.name, r.size))
      const changes = r.prices.flatMap(p => {
        const was = item ? priceIn(pricesByItem[item.id], p.year)?.price ?? null : null
        return was === p.price ? [] : [{ ...p, was }]
      })
      return { ...r, item, isNew: !item, changes }
    })
  }, [read, catalogue, pricesByItem])
  const todo = plan.filter(p => p.isNew || p.changes.length)
  const newItems = todo.filter(p => p.isNew).length
  const priceCount = todo.reduce((n, p) => n + p.changes.length, 0)

  const apply = async () => {
    setBusy(true)
    const batches: CatalogueBatch[] = []
    let current: CatalogueBatch = { client_id: clientId, upsert_items: [] }
    let size = 0
    for (const p of todo) {
      const cost = 1 + p.changes.length
      if (size + cost > CHUNK && size > 0) {
        batches.push(current)
        current = { client_id: clientId, upsert_items: [] }
        size = 0
      }
      current.upsert_items!.push({
        // A matched item by its own name and size ("ALL" matches a blank size here, not on the server).
        item_name: p.item?.item_name ?? p.name, size: p.item ? p.item.size ?? '' : p.size, notes: p.notes,
        prices: p.changes.map(c => ({ year: c.year, price: c.price, effective_date: yearStart(c.year) })),
      })
      size += cost
    }
    if (size) batches.push(current)
    const results: CatalogueBatchResult[] = []
    try {
      for (const b of batches) results.push(await catalogueApi.apply(b))
      onClose()
    } catch (e) {
      toast.error(`Import stopped: ${(e as Error).message}${results.length ? ' (the part already saved can be undone)' : ''}`)
    } finally {
      if (results.length) {
        recordCatalogue(qc, clientId, `Imported ${newItems ? `${newItems} new items, ` : ''}${priceCount} prices`, results)
      }
      setBusy(false)
    }
  }

  return (
    <Modal title={`Import catalogue: ${clientName}`} onClose={onClose} size="lg">
      {!grid ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Use a sheet with columns <b>Item</b>, <b>Size</b>, <b>Notes</b> and one column per year (<b>2025</b>, <b>2026</b>…)
            holding prices. Export gives you this layout with the current catalogue in it.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-8 cursor-pointer hover:border-navy-300 hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-white/5">
            <FileSpreadsheet className="w-8 h-8 text-navy-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300">Choose an .xlsx or .csv file</span>
            <input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <div>
            <span className="field-label">Or paste from Excel</span>
            <textarea className="field font-mono text-xs h-28" value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder={'Item\tSize\t2026\nKEMEJA PDH\tM\t145000'} />
            <button className="btn-secondary btn-sm mt-2" disabled={!pasted.trim()}
              onClick={() => setGrid(parseDelimited(pasted, pasted.includes('\t') ? '\t' : undefined))}>Read pasted rows</button>
          </div>
        </div>
      ) : read && 'error' in read ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{read.error}</p>
          <button className="btn-secondary btn-sm" onClick={() => setGrid(null)}>Choose another file</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {fileName && <span className="text-slate-400 dark:text-slate-500">{fileName}: </span>}
            {plan.length} rows. {newItems} new item{newItems === 1 ? '' : 's'}, {priceCount} price{priceCount === 1 ? '' : 's'} new or changed,
            {' '}{plan.length - todo.length} unchanged.
          </p>
          <div className="border border-slate-100 rounded-xl max-h-[45vh] overflow-y-auto dark:border-navy-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-navy-950 dark:text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-left px-3 py-2 font-medium">Prices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-navy-800/60">
                {todo.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">Nothing new: the catalogue already matches.</td></tr>}
                {todo.slice(0, 300).map(p => (
                  <tr key={itemKey(p.name, p.size)}>
                    <td className="px-3 py-1.5 align-top">
                      {p.name}{p.size && <span className="text-slate-400 dark:text-slate-500"> ({p.size})</span>}
                      {p.isNew && <span className="ml-2 badge-green text-[10px]">new</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs font-mono">
                      {p.changes.map(c => (
                        <span key={c.year} className="mr-3 whitespace-nowrap">
                          {c.year}: {c.was != null && <span className="text-slate-400 line-through mr-1 dark:text-slate-500">{formatRp(c.was)}</span>}
                          <span className="text-navy-900 font-semibold dark:text-slate-100">{formatRp(c.price)}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {todo.length > 300 && <p className="text-xs text-slate-400 dark:text-slate-500">Showing 300 of {todo.length}.</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!todo.length || busy} onClick={apply}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button className="btn-secondary" onClick={() => setGrid(null)}>Back</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
