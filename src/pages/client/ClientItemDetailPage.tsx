import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Package, Image as ImageIcon, Pencil, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { FormField, Spinner, formatRp, UppercaseField } from '@/components/ui'
import { clientHooks, clientItemHooks, clientItemPriceHooks } from '@/hooks'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import { sortPricesByRecency } from '@/utils/PriceHistory'
import { ClientItemPriceSpreadsheet } from './ClientItemPriceSpreadsheet'
import type { ClientItem, ClientItemPrice, UpdateClientItemRequest } from '@/types'
import type { ClientItemPriceRow } from '@/hooks'

// Big photo panel for one item — same upload/replace/remove affordances as
// the old inline table cell (ClientItemPhotoCell in ClientDetailPage), just
// scaled up now that it has a whole page to itself instead of a 36px cell.
function ItemPhotoPanel({ item }: { item: ClientItem }) {
  const upload = clientItemHooks.useUploadPhoto()
  const remove = clientItemHooks.useDeletePhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const [imgFailed, setImgFailed] = useState(false)
  // A bare "Remove" that fires on the first click is one misclick away from
  // losing the photo with no undo — same reasoning as CrudPage's delete
  // button and SpreadsheetView's row-delete trash icon, both of which arm
  // on a first click and only act on a second, deliberate one.
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
            className="w-full aspect-square rounded-xl object-cover border border-slate-200"
            onError={() => setImgFailed(true)}
          />
        </a>
      ) : item.photo_path && imgFailed ? (
        <div className="w-full aspect-square rounded-xl bg-red-50 flex items-center justify-center text-red-300 border border-red-100" title="Image failed to load">
          <ImageIcon size={40} />
        </div>
      ) : (
        <div className="w-full aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
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
            className={`text-sm hover:underline disabled:opacity-40 disabled:no-underline ${confirmingRemove ? 'text-red-700 font-medium' : 'text-red-500'}`}
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

// Name/size/notes, editable in place — no modal needed since this page is
// already scoped to exactly one item.
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
            <h1 className="text-lg font-semibold text-navy-900">{item.item_name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{item.size ?? 'No size specified'}</p>
          </div>
          <button onClick={startEdit} className="btn-ghost btn-sm !px-2" title="Edit item">
            <Pencil size={14} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-3 whitespace-pre-wrap">{item.notes || 'No notes.'}</p>
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

// Same calculator as before, minus the item picker — this page IS the
// item, so "which item" is never in question. Every new price recorded
// here writes straight into this item's history below.
function ItemPriceHikeCalculator({ item, prices }: { item: ClientItem; prices: ClientItemPrice[] }) {
  const create = clientItemPriceHooks.useCreate()
  const [pct, setPct] = useState('')
  const [priceDigits, setPriceDigits] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Most-recent-first — see sortPricesByRecency for why the effective_date
  // tie-break matters (a price can be revised mid-year, and year alone
  // can't tell two same-year entries apart).
  const last = sortPricesByRecency(prices, 'desc')[0]

  useEffect(() => {
    const pctNum = Number(pct)
    if (last && pct !== '' && !isNaN(pctNum)) {
      setPriceDigits(String(Math.round(last.price * (1 + pctNum / 100))))
    }
    // `last` deliberately included (unlike a typical "run only when the
    // user types a %" effect) — prices can refetch in the background
    // (e.g. after Save This Price, or another tab/user adding one), and
    // without this, a percentage typed before that refetch would keep
    // suggesting a price computed off the now-stale "Last Price" instead
    // of the one the read-only field above it is currently showing.
  }, [pct, last])

  const priceNum = priceDigits ? Number(priceDigits) : null

  const handleSave = () => {
    if (priceNum == null) return
    // setPct/setPriceDigits used to run unconditionally right after
    // .mutate() fired — meaning they cleared regardless of whether the
    // save actually succeeded. A failed save (network drop, validation
    // error) silently wiped whatever price/percentage was just typed with
    // no error shown and nothing to recover it — exactly the data-loss
    // pattern the rest of the app's spreadsheets (ProductionSpreadsheet/
    // OperationsSpreadsheet's onCreateRow handling) are careful to avoid.
    // Gating the clear on onSuccess, and adding onError, fixes both: a
    // failure now leaves the typed values in place and says so.
    create.mutate(
      { client_item_id: item.id, year, price: priceNum, effective_date: effectiveDate ? new Date(effectiveDate).toISOString() : null },
      {
        onSuccess: () => { setPct(''); setPriceDigits('') },
        onError: () => toast.error("Couldn't save this price — check your connection and try again."),
      }
    )
  }

  return (
    <div className="card p-4 mb-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Price Hike Calculator</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <FormField label="Last Price">
          <input className="field font-mono bg-slate-50 text-slate-500 cursor-not-allowed" readOnly
            value={last ? `${formatRp(last.price)} (${last.year})` : 'No history yet'} />
        </FormField>
        <FormField label="Hike %">
          <input className="field" type="number" placeholder="e.g. 15" value={pct}
            onChange={e => setPct(e.target.value)} disabled={!last}
            title={!last ? 'No previous price to hike from — type the price directly instead' : undefined} />
        </FormField>
        <FormField label="New Price" required>
          <input className="field font-mono" inputMode="numeric" placeholder="e.g. 120,000"
            value={formatThousands(priceDigits)}
            onChange={e => setPriceDigits(stripCommas(e.target.value))} />
        </FormField>
        <FormField label="For Year">
          <input className="field" type="number" value={year} onChange={e => setYear(Number(e.target.value) || year)} />
        </FormField>
        <FormField label="Effective Date">
          <input className="field" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
        </FormField>
      </div>
      <div className="flex justify-end mt-3">
        <button className="btn-primary !py-1.5 !px-3 text-sm" disabled={priceNum == null || create.isPending} onClick={handleSave}>
          {create.isPending ? 'Saving…' : 'Save This Price'}
        </button>
      </div>
    </div>
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

  if (itemLoading) return <Spinner />
  // Distinguish "the fetch actually failed" from "this item genuinely
  // doesn't exist" — previously indistinguishable, since a failed
  // clientItemHooks.useGet() left `item` undefined the same as a real
  // 404 would, and both fell through to the same "Item not found."
  // message with no way to retry a fetch that just needs another try.
  if (itemError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-3">Couldn't load this item — check your connection and try again.</p>
        <button onClick={() => refetchItem()} className="btn-secondary">Retry</button>
      </div>
    )
  }
  if (!item) return <div className="p-8 text-red-400">Item not found.</div>

  // Reuses the existing spreadsheet component — grouped by client_item_id,
  // which here always resolves to this one item, so it renders as a
  // single-group table instead of needing a stripped-down variant.
  const rows: ClientItemPriceRow[] = prices.map(p => ({ ...p, item_name: item.item_name, size: item.size }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/clients/${clientId}?tab=catalogue`)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title="Back to catalogue">
          <ArrowLeft size={18} />
        </button>
        <Package className="text-navy-600" size={20} />
        <div>
          <p className="text-xs text-slate-400">
            <Link to={`/clients/${clientId}?tab=catalogue`} className="hover:underline">{client?.client_name ?? 'Client'}</Link> / Catalogue
          </p>
          <h2 className="text-lg font-semibold text-slate-800">{item.item_name}{item.size ? ` (${item.size})` : ''}</h2>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        <div className="md:w-64 shrink-0">
          <ItemPhotoPanel item={item} />
        </div>
        <ItemDetailsPanel item={item} />
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Price History</h3>
        {pricesLoading ? (
          <Spinner />
        ) : pricesError ? (
          <div className="p-6 text-center">
            <p className="text-red-400 mb-3">Couldn't load price history — check your connection and try again.</p>
            <button onClick={() => refetchPrices()} className="btn-secondary">Retry</button>
          </div>
        ) : (
          <>
            <ItemPriceHikeCalculator item={item} prices={prices} />
            <ClientItemPriceSpreadsheet data={rows} items={[item]} />
          </>
        )}
      </div>
    </div>
  )
}