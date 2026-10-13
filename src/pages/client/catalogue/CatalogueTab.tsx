import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Copy, Download, FileUp, Image as ImageIcon, Package, Plus, Search, Trash2, TrendingUp, X,
} from 'lucide-react'
import { ConfirmDialog, EditableCell, formatRp } from '@/components/ui'
import { Card, ErrorState, LoadingState } from '@/components/ui/Page'
import { useCatalogueBatch, undoCatalogue, useClientSales, type Sale } from '@/hooks/catalogue'
import { buildXlsx, downloadBlob, type SheetSpec } from '@/utils/xlsx'
import { formatDateShort } from '@/utils/MonthUtils'
import { isTyping } from '@/utils/isTyping'
import type { Client, ClientItem, ClientItemPrice } from '@/types'
import {
  catalogueSheet, groupCatalogue, itemKey, itemLabel, pctChange, priceBefore, priceIn, priceYears, yearStart,
} from './catalogueModel'
import { RaisePricesDialog } from './RaisePricesDialog'
import { AddItemsDialog } from './AddItemsDialog'
import { CopyFromClientDialog } from './CopyFromClientDialog'
import { CatalogueImportDialog } from './CatalogueImportDialog'

type Dialog =
  | { kind: 'raise'; items: ClientItem[] }
  | { kind: 'add'; name?: string; notes?: string | null }
  | { kind: 'copy' }
  | { kind: 'import' }
  | { kind: 'delete'; items: ClientItem[] }

const thisYear = new Date().getFullYear()

function Thumb({ item, onOpen }: { item: ClientItem | undefined; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  return (
    <button onClick={onOpen} title="Open item page" className="shrink-0">
      {item?.photo_path && !failed ? (
        <img src={item.photo_path} alt="" onError={() => setFailed(true)}
          className="w-9 h-9 rounded-lg object-cover border border-slate-200 hover:opacity-80" />
      ) : (
        <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 hover:bg-slate-200">
          <ImageIcon size={15} />
        </span>
      )}
    </button>
  )
}

const soldText = (sales: Sale[] | undefined) => {
  if (!sales?.length) return null
  const qty = sales.reduce((n, s) => n + s.qty, 0)
  return `${qty.toLocaleString('id-ID')} pcs · ${sales.length} order${sales.length === 1 ? '' : 's'}`
}

/** A client's catalogue: each item with its sizes, their price for a year
 *  next to the year before (edit in place), what's been ordered, and the
 *  tools to set a whole year's prices at once. */
export function CatalogueTab({ client, items, isLoading, isError, onRetry, allPrices, pricesByItem, onPrint }: {
  client: Client
  items: ClientItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  allPrices: Record<string, ClientItemPrice[]>
  pricesByItem: Record<number, ClientItemPrice[]>
  onPrint: (year: number) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const save = useCatalogueBatch()
  const { sales } = useClientSales(client)
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [year, setYear] = useState(thisYear)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  // Ordered lines left out of "add them to the catalogue".
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  const years = useMemo(() => {
    const ys = new Set([...priceYears(pricesByItem, items), thisYear, thisYear + 1])
    return [...ys].sort((a, b) => b - a)
  }, [pricesByItem, items])

  const groups = useMemo(() => {
    const q = query.trim().toUpperCase()
    return groupCatalogue(items)
      .map(g => ({
        ...g,
        items: g.items.filter(i =>
          (!q || itemLabel(i).toUpperCase().includes(q) || (i.notes ?? '').toUpperCase().includes(q)) &&
          (!onlyMissing || !priceIn(pricesByItem[i.id], year))),
      }))
      .filter(g => g.items.length)
  }, [items, query, onlyMissing, pricesByItem, year])
  const shown = groups.flatMap(g => g.items)
  const missing = items.filter(i => !priceIn(pricesByItem[i.id], year)).length
  const pickedItems = items.filter(i => selected.has(i.id))

  // Lines this client ordered that aren't in the catalogue.
  const notListed = useMemo(() => {
    const listed = new Set(items.map(i => itemKey(i.item_name, i.size)))
    return [...sales].filter(([k]) => !listed.has(k)).map(([, s]) => s)
      .sort((a, b) => a[0].item.localeCompare(b[0].item))
  }, [items, sales])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault()
        undoCatalogue(qc)
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && selected.size && !isTyping(e.target)) {
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qc, dialog, selected.size])

  const toggle = (ids: number[]) => setSelected(prev => {
    const next = new Set(prev)
    const all = ids.every(id => next.has(id))
    for (const id of ids) if (all) next.delete(id); else next.add(id)
    return next
  })

  const setPrice = (item: ClientItem, value: number) => {
    const current = priceIn(pricesByItem[item.id], year)
    if (!value) {
      if (current) save.mutate({ label: `Removed the ${year} price of ${itemLabel(item)}`, batch: { client_id: client.id, delete_prices: [{ client_item_id: item.id, year }] } })
      return
    }
    save.mutate({
      label: `${itemLabel(item)} ${year}: ${formatRp(value)}`,
      batch: { client_id: client.id, set_prices: [{ client_item_id: item.id, year, price: value, effective_date: current?.effective_date ?? yearStart(year) }] },
    })
  }

  const remove = (gone: ClientItem[]) => save.mutate({
    label: `Deleted ${gone.length === 1 ? itemLabel(gone[0]) : `${gone.length} items`}`,
    batch: { client_id: client.id, delete_items: gone.map(i => i.id) },
  }, { onSuccess: () => setSelected(new Set()) })

  const toAdd = notListed.filter(s => !skipped.has(itemKey(s[0].item, s[0].size)))
  const addFromOrders = () => save.mutate({
    label: `Added ${toAdd.length} ordered item${toAdd.length === 1 ? '' : 's'}`,
    batch: {
      client_id: client.id,
      upsert_items: toAdd.map(s => {
        const last = s[0]
        const y = new Date(last.date).getFullYear()
        return { item_name: last.item, size: last.size, prices: last.price > 0 ? [{ year: y, price: last.price, effective_date: yearStart(y) }] : [] }
      }),
    },
  })

  const exportExcel = () => {
    const lines = [...sales.values()].flat().sort((a, b) => b.date.localeCompare(a.date))
    const salesSheet: SheetSpec = {
      name: 'Orders',
      columns: [
        { header: 'Order' }, { header: 'Date', kind: 'date', width: 12 }, { header: 'Item', width: 34 }, { header: 'Size', width: 8 },
        { header: 'Qty', kind: 'number', width: 8 }, { header: 'Price', kind: 'money', width: 14 }, { header: 'Subtotal', kind: 'money', width: 15 },
      ],
      rows: lines.map(s => [s.orderId, s.date.slice(0, 10), s.item, s.size, s.qty, s.price, s.qty * s.price]),
    }
    downloadBlob(buildXlsx([catalogueSheet(items, pricesByItem), salesSheet]), `Catalogue ${client.client_name}.xlsx`)
  }

  const open = (item: ClientItem) => navigate(`/clients/${client.id}/items/${item.id}`)
  const prevYear = year - 1

  return (
    <div className="space-y-4">
      <Card bodyClassName="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input ref={searchRef} className="field pl-9" placeholder="Search items  ( / )" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Prices for
            <select className="field !w-auto !py-1.5" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setDialog({ kind: 'add' })}>
              <Plus size={14} /> Add item
            </button>
            <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" disabled={!items.length}
              onClick={() => setDialog({ kind: 'raise', items: pickedItems.length ? pickedItems : items })}>
              <TrendingUp size={14} /> Raise prices{pickedItems.length ? ` (${pickedItems.length})` : ''}
            </button>
            <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => setDialog({ kind: 'copy' })}>
              <Copy size={14} /> Copy from client
            </button>
            <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => setDialog({ kind: 'import' })}>
              <FileUp size={14} /> Import
            </button>
            <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" disabled={!items.length} onClick={exportExcel}>
              <Download size={14} /> Excel
            </button>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{items.length} items in {groupCatalogue(items).length} names</span>
            <span className="text-slate-300">·</span>
            {missing ? (
              <button onClick={() => setOnlyMissing(v => !v)}
                className={`badge ${onlyMissing ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                {missing} without a {year} price{onlyMissing ? ': showing only these' : ''}
              </button>
            ) : <span className="badge-green">every item priced for {year}</span>}
            <button className="ml-auto text-navy-600 hover:underline" onClick={() => onPrint(year)}>Print the {year} price list</button>
          </div>
        )}
      </Card>

      <Card bodyClassName="p-0">
        {isLoading ? <LoadingState /> : isError ? <ErrorState what="the catalogue" onRetry={onRetry} /> : !items.length ? (
          <div className="py-14 text-center">
            <Package className="w-9 h-9 text-slate-200 mx-auto mb-3" />
            <p className="font-medium text-slate-600 text-sm">No items yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Add an item with its sizes, copy another client's catalogue, or import a sheet.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary btn-sm" onClick={() => setDialog({ kind: 'add' })}>Add item</button>
              <button className="btn-secondary btn-sm" onClick={() => setDialog({ kind: 'copy' })}>Copy from client</button>
              <button className="btn-secondary btn-sm" onClick={() => setDialog({ kind: 'import' })}>Import</button>
            </div>
          </div>
        ) : !shown.length ? (
          <p className="py-10 text-center text-sm text-slate-400">Nothing matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:min-w-[720px]">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" aria-label="Select all shown" checked={shown.every(i => selected.has(i.id))}
                      onChange={() => toggle(shown.map(i => i.id))} />
                  </th>
                  <th className="text-left font-medium px-2 py-2.5">Item / size</th>
                  <th className="hidden md:table-cell text-right font-medium px-2 py-2.5 w-32">{prevYear}</th>
                  <th className="text-right font-medium px-2 py-2.5 w-36 text-navy-900">{year}</th>
                  <th className="hidden sm:table-cell text-right font-medium px-2 py-2.5 w-20">Change</th>
                  <th className="hidden md:table-cell text-left font-medium px-4 py-2.5">Ordered</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const ids = g.items.map(i => i.id)
                  const groupSales = g.items.flatMap(i => sales.get(itemKey(i.item_name, i.size)) ?? [])
                  const withPhoto = g.items.find(i => i.photo_path) ?? g.items[0]
                  return [
                    <tr key={`g-${g.name}`} className="bg-slate-50/70 border-t border-slate-100">
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Select all sizes of ${g.name}`} checked={ids.every(id => selected.has(id))} onChange={() => toggle(ids)} />
                      </td>
                      <td className="px-2 py-2" colSpan={4}>
                        <div className="flex items-center gap-3">
                          <Thumb item={withPhoto} onOpen={() => open(withPhoto)} />
                          <div className="min-w-0">
                            <button onClick={() => open(g.items[0])} className="font-semibold text-navy-900 hover:underline text-left">{g.name}</button>
                            {g.items[0].notes && <p className="text-xs text-slate-400 truncate max-w-md">{g.items[0].notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-2 text-xs text-slate-500">{soldText(groupSales)}</td>
                      <td className="pr-3">
                        <button className="btn-ghost !p-1.5" title="Add sizes" onClick={() => setDialog({ kind: 'add', name: g.name, notes: g.items[0].notes })}>
                          <Plus size={14} />
                        </button>
                      </td>
                    </tr>,
                    ...g.items.map(item => {
                      const now = priceIn(pricesByItem[item.id], year)
                      const before = priceBefore(pricesByItem[item.id], year)
                      const pct = now && before ? pctChange(before.price, now.price) : null
                      const itemSales = sales.get(itemKey(item.item_name, item.size))
                      const last = itemSales?.[0]
                      return (
                        <tr key={item.id} className={`group border-t border-slate-50 ${selected.has(item.id) ? 'bg-navy-50/40' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-3 py-1">
                            <input type="checkbox" aria-label={`Select ${itemLabel(item)}`} checked={selected.has(item.id)} onChange={() => toggle([item.id])} />
                          </td>
                          <td className="px-2 py-1 pl-4 md:pl-14">
                            <button onClick={() => open(item)} className="text-slate-700 hover:text-navy-700 hover:underline">
                              {item.size || <span className="text-slate-400">one size</span>}
                            </button>
                          </td>
                          <td className="hidden md:table-cell px-2 py-1 text-right font-mono text-slate-400">
                            {before ? <>{formatRp(before.price)}{before.year !== prevYear && <span className="text-[10px] ml-1">({before.year})</span>}</> : '—'}
                          </td>
                          <td className="px-1 py-0.5 text-right font-mono">
                            <EditableCell type="number" value={now?.price ?? null} placeholder="set price"
                              format={v => <span className="font-semibold text-navy-900">{formatRp(Number(v))}</span>}
                              onSave={v => setPrice(item, Number(v))} />
                          </td>
                          <td className={`hidden sm:table-cell px-2 py-1 text-right text-xs ${pct == null ? 'text-slate-300' : pct > 0 ? 'text-green-700' : pct < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {pct == null ? '' : pct === 0 ? 'same' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                          </td>
                          <td className="hidden md:table-cell px-4 py-1 text-xs text-slate-500">
                            {last ? (
                              <>
                                {soldText(itemSales)}
                                <span className="text-slate-400"> · last {formatDateShort(last.date)} at </span>
                                <span className={`font-mono ${now && last.price !== now.price && new Date(last.date).getFullYear() === year ? 'text-amber-700' : ''}`}
                                  title={now && last.price !== now.price ? `The ${year} catalogue price is ${formatRp(now.price)}` : undefined}>
                                  {formatRp(last.price)}
                                </span>
                              </>
                            ) : <span className="text-slate-300">not ordered yet</span>}
                          </td>
                          <td className="pr-3">
                            <button className="btn-ghost !p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Delete"
                              onClick={() => setDialog({ kind: 'delete', items: [item] })}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {notListed.length > 0 && (
        <Card title={`Ordered but not in the catalogue (${notListed.length})`} icon={Package}
          actions={
            <button className="btn-secondary btn-sm" disabled={!toAdd.length || save.isPending} onClick={addFromOrders}>
              Add {toAdd.length === notListed.length ? 'them' : toAdd.length} with the last order price
            </button>
          }>
          <div className="flex flex-wrap gap-1.5">
            {notListed.map(s => {
              const k = itemKey(s[0].item, s[0].size)
              const on = !skipped.has(k)
              return (
                <button key={k} title={on ? 'Leave this one out' : 'Add this one'}
                  onClick={() => setSkipped(p => { const n = new Set(p); if (on) n.add(k); else n.delete(k); return n })}
                  className={`badge gap-1.5 border ${on ? 'bg-navy-50 text-navy-800 border-navy-100' : 'bg-white text-slate-400 border-slate-200 line-through'}`}>
                  <span>{s[0].item}</span>
                  <span className={s[0].size ? '' : 'opacity-60'}>({s[0].size || 'no size'})</span>
                  <span className="opacity-70">{formatRp(s[0].price)}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:left-[256px] z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-navy-900 text-white rounded-2xl shadow-xl px-4 py-2.5 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <button className="btn-gold btn-sm" onClick={() => setDialog({ kind: 'raise', items: pickedItems })}>Raise prices</button>
            <button className="btn-sm btn bg-white/10 hover:bg-white/20" onClick={() => setDialog({ kind: 'delete', items: pickedItems })}>Delete</button>
            <button className="btn-ghost !p-1.5 text-white/70 hover:text-white hover:bg-white/10" title="Clear (Esc)" onClick={() => setSelected(new Set())}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {dialog?.kind === 'raise' && (
        <RaisePricesDialog clientId={client.id} items={dialog.items} pricesByItem={pricesByItem}
          defaultYear={priceIn(pricesByItem[dialog.items[0]?.id], year) ? year + 1 : year} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'add' && (
        <AddItemsDialog clientId={client.id} catalogue={items} year={year}
          initialName={dialog.name} initialNotes={dialog.notes} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'copy' && (
        <CopyFromClientDialog clientId={client.id} catalogue={items} allPrices={allPrices} year={year} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'import' && (
        <CatalogueImportDialog clientId={client.id} clientName={client.client_name} catalogue={items}
          pricesByItem={pricesByItem} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          message={`Delete ${dialog.items.length === 1 ? itemLabel(dialog.items[0]) : `${dialog.items.length} items`} and ${dialog.items.length === 1 ? 'its' : 'their'} prices?${dialog.items.some(i => i.photo_path) ? ' Photos are deleted too.' : ''} Undo brings the items and prices back.`}
          onConfirm={() => { remove(dialog.items); setDialog(null) }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
