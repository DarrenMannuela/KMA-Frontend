import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Image as ImageIcon, Pencil, X, Check, Tag, Trash2, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { EditableCell, FormField, formatRp, UppercaseField } from '@/components/ui'
import { Card, ErrorState, LoadingState } from '@/components/ui/Page'
import { clientHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { useCatalogueBatch, undoCatalogue, useClientSales } from '@/hooks/catalogue'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import { priceForYear } from '@/utils/PriceHistory'
import { formatDateShort } from '@/utils/MonthUtils'
import { isTyping } from '@/utils/isTyping'
import type { Client, ClientItem, ClientItemPrice, UpdateClientItemRequest } from '@/types'
import { adjustPrice, compareSizes, itemKey, itemLabel, pctChange, yearStart } from './catalogue/catalogueModel'

// The item's photo: upload, replace, remove.
function ItemPhotoPanel({ item }: { item: ClientItem }) {
  const upload = clientItemHooks.useUploadPhoto()
  const remove = clientItemHooks.useDeletePhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const [imgFailed, setImgFailed] = useState(false)
  // Remove asks for a second click.
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const handleRemove = () => {
    if (!confirmingRemove) { setConfirmingRemove(true); return }
    setConfirmingRemove(false)
    remove.mutate(item.id, { onError: () => toast.error("Couldn't remove the photo — check your connection and try again.") })
  }

  return (
    <div className="card p-4 flex flex-col items-center gap-3">
      {item.photo_path && !imgFailed ? (
        <a href={item.photo_path} target="_blank" rel="noopener noreferrer" title="View full size" className="w-full">
          <img
            src={item.photo_path}
            alt={item.item_name}
            className="w-full aspect-square rounded-xl object-cover border border-slate-200 dark:border-navy-700"
            onError={() => setImgFailed(true)}
          />
        </a>
      ) : item.photo_path && imgFailed ? (
        <div className="w-full aspect-square rounded-xl bg-red-50 flex items-center justify-center text-red-300 border border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-500" title="Image failed to load">
          <ImageIcon size={40} />
        </div>
      ) : (
        <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 dark:bg-white/10 dark:text-navy-700">
          <ImageIcon size={40} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="text-sm text-navy-600 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          {upload.isPending ? 'Uploading…' : item.photo_path ? 'Replace photo' : 'Upload photo'}
        </button>
        {item.photo_path && (
          <button
            onClick={handleRemove}
            onBlur={() => setConfirmingRemove(false)}
            disabled={remove.isPending}
            className={`text-sm hover:underline disabled:opacity-40 disabled:no-underline ${confirmingRemove ? 'text-red-700 font-medium dark:text-red-300' : 'text-red-500 dark:text-red-400'}`}
          >
            {remove.isPending ? 'Removing…' : confirmingRemove ? 'Click again to confirm' : 'Remove'}
          </button>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            upload.mutate({ id: item.id, file }, { onError: () => toast.error("Couldn't upload the photo — check your connection and try again.") })
            setImgFailed(false)
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}

// Name, size and notes, edited in place.
function ItemDetailsPanel({ item }: { item: ClientItem }) {
  const update = clientItemHooks.useUpdate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<UpdateClientItemRequest>({
    item_name: item.item_name, size: item.size, notes: item.notes,
  })

  const startEdit = () => {
    setForm({ item_name: item.item_name, size: item.size, notes: item.notes })
    setEditing(true)
  }
  const save = () => update.mutate({ id: item.id, body: form }, {
    onSuccess: () => setEditing(false),
    onError: () => toast.error("Couldn't save — check your connection and try again."),
  })

  if (!editing) {
    return (
      <div className="card p-4 flex-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-navy-900 dark:text-slate-50">{item.item_name}</h1>
            <p className="text-sm text-slate-500 mt-0.5 dark:text-slate-400">{item.size ?? 'No size specified'}</p>
          </div>
          <button onClick={startEdit} className="btn-ghost btn-sm !px-2" title="Edit item">
            <Pencil size={14} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-3 whitespace-pre-wrap dark:text-slate-400">{item.notes || 'No notes.'}</p>
      </div>
    )
  }

  return (
    <div className="card p-4 flex-1 space-y-3">
      <FormField label="Item Name" required>
        <UppercaseField className="field" value={form.item_name ?? ''}
          onChange={v => setForm(p => ({ ...p, item_name: v }))} />
      </FormField>
      <FormField label="Size">
        <UppercaseField className="field" value={form.size ?? ''}
          onChange={v => setForm(p => ({ ...p, size: v || null }))} />
      </FormField>
      <FormField label="Notes">
        <UppercaseField as="textarea" className="field resize-none" rows={2} value={form.notes ?? ''}
          onChange={v => setForm(p => ({ ...p, notes: v || null }))} />
      </FormField>
      <div className="flex gap-2">
        <button className="btn-primary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" disabled={update.isPending} onClick={save}>
          <Check size={14} /> {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1.5" onClick={() => setEditing(false)}>
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  )
}

/** The item's price for each year, newest first: edit in place, add a year,
 *  remove one. Saved through the catalogue batch, so Ctrl+Z undoes it. */
function ItemPrices({ item, prices }: { item: ClientItem; prices: ClientItemPrice[] }) {
  const save = useCatalogueBatch()
  const rows = [...prices].sort((a, b) => b.year - a.year)
  const [newYear, setNewYear] = useState(() => (rows[0]?.year ?? new Date().getFullYear() - 1) + 1)
  const [newPrice, setNewPrice] = useState('')
  const set = (year: number, price: number, effective: string | null, label: string) => save.mutate({
    label, batch: { client_id: item.client_id, set_prices: [{ client_item_id: item.id, year, price, effective_date: effective }] },
  })
  const remove = (year: number) => save.mutate({
    label: `Removed the ${year} price`, batch: { client_id: item.client_id, delete_prices: [{ client_item_id: item.id, year }] },
  })
  const add = () => {
    const existing = rows.find(r => r.year === newYear)
    set(newYear, Number(newPrice), existing?.effective_date ?? yearStart(newYear), `${newYear}: ${formatRp(Number(newPrice))}`)
    setNewPrice('')
    setNewYear(y => y + 1)
  }
  const last = rows[0]

  return (
    <Card title="Prices by year" icon={Tag} bodyClassName="p-0 pt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-100 dark:text-slate-500 dark:border-navy-800">
            <th className="text-left font-medium px-5 py-2 w-20">Year</th>
            <th className="text-right font-medium px-2 py-2">Price</th>
            <th className="text-right font-medium px-2 py-2 w-24">vs year before</th>
            <th className="text-left font-medium px-4 py-2 w-40">From</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const prev = rows[i + 1]
            const pct = prev ? pctChange(prev.price, p.price) : null
            return (
              <tr key={p.id} className="group border-t border-slate-50 dark:border-navy-800/60">
                <td className="px-5 py-1 font-mono text-slate-600 dark:text-slate-300">{p.year}</td>
                <td className="px-1 py-0.5 text-right font-mono">
                  <EditableCell type="number" value={p.price}
                    format={v => <span className="font-semibold text-navy-900 dark:text-slate-100">{formatRp(Number(v))}</span>}
                    onSave={v => (Number(v) ? set(p.year, Number(v), p.effective_date, `${p.year}: ${formatRp(Number(v))}`) : remove(p.year))} />
                </td>
                <td className={`px-2 py-1 text-right text-xs ${pct == null ? 'text-slate-300 dark:text-navy-700' : pct > 0 ? 'text-green-700 dark:text-green-400' : pct < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {pct == null ? '' : pct === 0 ? 'same' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-0.5 text-slate-500 dark:text-slate-400">
                  <EditableCell type="date" value={p.effective_date?.slice(0, 10) ?? null}
                    format={v => formatDateShort(String(v))}
                    onSave={v => set(p.year, p.price, v ? new Date(String(v)).toISOString() : null, `${p.year} price date changed`)} />
                </td>
                <td className="pr-3">
                  <button className="btn-ghost !p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100" title={`Remove the ${p.year} price`} onClick={() => remove(p.year)}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            )
          })}
          <tr className="border-t border-slate-100 bg-slate-50/60 dark:border-navy-800 dark:bg-navy-950/60">
            <td className="px-5 py-2">
              <input className="field !py-1 !px-2 font-mono w-20" type="number" value={newYear}
                onChange={e => setNewYear(Number(e.target.value) || newYear)} />
            </td>
            <td className="px-2 py-2" colSpan={3}>
              <div className="flex items-center gap-2 justify-end">
                <input className="field !py-1 font-mono text-right max-w-[160px]" inputMode="numeric"
                  placeholder={last ? formatThousands(String(last.price)) : 'price'}
                  value={formatThousands(newPrice)} onChange={e => setNewPrice(stripCommas(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && newPrice && add()} />
                {last && [5, 10].map(pct => (
                  <button key={pct} className="btn-ghost btn-sm" title={`${pct}% over ${last.year}, rounded up to Rp 1,000`}
                    onClick={() => setNewPrice(String(adjustPrice(last.price, { mode: 'pct', amount: pct, roundTo: 1000 })))}>
                    +{pct}%
                  </button>
                ))}
                <button className="btn-primary btn-sm" disabled={!newPrice || save.isPending} onClick={add}>
                  {rows.some(r => r.year === newYear) ? 'Replace' : 'Add'}
                </button>
              </div>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      {!rows.length && <p className="px-5 pb-3 text-xs text-slate-400 dark:text-slate-500">No prices yet: add this item's price for a year above.</p>}
    </Card>
  )
}

/** Every order of this item by this client, with the price it went at next
 *  to the catalogue price for that year. */
function ItemSales({ item, prices, client }: { item: ClientItem; prices: ClientItemPrice[]; client: Client | undefined }) {
  const { sales, isLoading } = useClientSales(client)
  const lines = sales.get(itemKey(item.item_name, item.size)) ?? []
  const byYear = new Map<number, number>()
  for (const s of lines) byYear.set(new Date(s.date).getFullYear(), (byYear.get(new Date(s.date).getFullYear()) ?? 0) + s.qty)

  return (
    <Card title="Orders" icon={ShoppingBag} bodyClassName="p-0 pt-2"
      actions={byYear.size > 0 && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {[...byYear].sort((a, b) => b[0] - a[0]).map(([y, q]) => `${y}: ${q.toLocaleString('id-ID')} pcs`).join(' · ')}
        </span>
      )}>
      {isLoading ? <LoadingState /> : !lines.length ? (
        <p className="px-5 pb-4 text-sm text-slate-400 dark:text-slate-500">{client ? `${client.client_name} hasn't ordered this yet.` : 'Not ordered yet.'}</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 dark:text-slate-500 dark:border-navy-800">
                <th className="text-left font-medium px-5 py-2">Order</th>
                <th className="text-left font-medium px-2 py-2">Date</th>
                <th className="text-right font-medium px-2 py-2">Qty</th>
                <th className="text-right font-medium px-2 py-2">Price</th>
                <th className="text-right font-medium px-5 py-2">Catalogue</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((s, i) => {
                const listed = priceForYear(prices, new Date(s.date).getFullYear())
                const off = listed && listed.price !== s.price
                return (
                  <tr key={`${s.orderId}-${i}`} className="border-t border-slate-50 dark:border-navy-800/60">
                    <td className="px-5 py-1.5"><Link to={`/orders/${encodeURIComponent(s.orderId)}`} className="text-navy-700 hover:underline font-mono text-xs dark:text-slate-200">{s.orderId}</Link></td>
                    <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{formatDateShort(s.date)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{s.qty.toLocaleString('id-ID')}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${off ? 'text-amber-700 dark:text-amber-400' : 'text-navy-900 dark:text-slate-100'}`}>{formatRp(s.price)}</td>
                    <td className="px-5 py-1.5 text-right font-mono text-slate-400 dark:text-slate-500">{listed ? formatRp(listed.price) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function ClientItemDetailPage() {
  const { clientId: clientIdParam, itemId: itemIdParam } = useParams<{ clientId: string; itemId: string }>()
  const navigate = useNavigate()
  const clientId = Number(clientIdParam)
  const itemId = Number(itemIdParam)

  const { data: client } = clientHooks.useGet(clientId)
  const { data: item, isLoading: itemLoading, isError: itemError, refetch: refetchItem } = clientItemHooks.useGet(itemId)
  const { data: prices = [], isLoading: pricesLoading, isError: pricesError, refetch: refetchPrices } = clientItemPriceHooks.useByItem(itemId)
  const { data: catalogue = [] } = clientItemHooks.useByClient(clientId)
  const qc = useQueryClient()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault()
        undoCatalogue(qc)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qc])

  if (itemLoading) return <div className="p-4 md:p-6"><LoadingState label="Loading item…" /></div>
  if (itemError) return <div className="p-4 md:p-6"><ErrorState what="this item" onRetry={() => refetchItem()} /></div>
  if (!item) return <div className="p-4 md:p-6"><ErrorState what="this item" /></div>

  const sizes = catalogue.filter(i => i.item_name === item.item_name).sort((a, b) => compareSizes(a.size, b.size))
  const back = `/clients/${clientId}?tab=catalogue`

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(back)} className="btn-secondary !px-2.5 shrink-0" title="Back to catalogue">
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            <Link to={back} className="hover:underline">{client?.client_name ?? 'Client'}</Link> / Catalogue
          </p>
          <h2 className="font-display font-semibold text-navy-900 leading-tight dark:text-slate-50">{itemLabel(item)}</h2>
        </div>
        {sizes.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {sizes.map(s => (
              <Link key={s.id} to={`/clients/${clientId}/items/${s.id}`}
                className={`px-2.5 py-1 rounded-lg text-xs border ${s.id === item.id ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-navy-900 dark:text-slate-300 dark:border-navy-700 dark:hover:border-navy-600'}`}>
                {s.size || 'one size'}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        <div className="md:w-64 shrink-0">
          <ItemPhotoPanel item={item} />
        </div>
        <ItemDetailsPanel item={item} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {pricesLoading ? <LoadingState /> : pricesError ? (
          <ErrorState what="the prices" onRetry={() => refetchPrices()} />
        ) : (
          <ItemPrices item={item} prices={prices} />
        )}
        <ItemSales item={item} prices={prices} client={client} />
      </div>
    </div>
  )
}