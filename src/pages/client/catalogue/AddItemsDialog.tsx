import { useState } from 'react'
import { X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { FormField, UppercaseField } from '@/components/ui'
import { useCatalogueBatch } from '@/hooks/catalogue'
import { formatThousands, stripCommas } from '@/utils/NumberFormat'
import type { ClientItem } from '@/types'
import { compareSizes, PRESET_SIZES, yearStart } from './catalogueModel'

/** An item with all its sizes at once, each with its price for a year. Adding
 *  a size that's already in the catalogue sets its price instead. */
export function AddItemsDialog({ clientId, catalogue, year, initialName = '', initialNotes = null, onClose }: {
  clientId: number
  catalogue: ClientItem[]
  year: number
  /** Adding sizes to an item that's already there. */
  initialName?: string
  initialNotes?: string | null
  onClose: () => void
}) {
  const save = useCatalogueBatch()
  const [name, setName] = useState(initialName)
  const [notes, setNotes] = useState<string | null>(initialNotes)
  const [sizes, setSizes] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [priceYear, setPriceYear] = useState(year)
  const [allPrice, setAllPrice] = useState('')
  // A size's own price, when it differs from the one for all.
  const [own, setOwn] = useState<Record<string, string>>({})

  // Exactly as the server matches them: same name and size.
  const exact = (n: string, size: string | null) => `${n.trim().toUpperCase()}|${(size ?? '').trim().toUpperCase()}`
  const existing = new Set(catalogue.map(i => exact(i.item_name, i.size)))
  const toggle = (s: string) => setSizes(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s].sort(compareSizes)))
  const addCustom = () => {
    const extra = custom.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    setSizes(p => [...new Set([...p, ...extra])].sort(compareSizes))
    setCustom('')
  }
  // No size picked: one item without a size.
  const rows = sizes.length ? sizes : ['']
  const priceOf = (s: string) => own[s] ?? allPrice

  const submit = () => save.mutate({
    label: `Added ${name.trim()}${sizes.length ? ` in ${sizes.length} size${sizes.length === 1 ? '' : 's'}` : ''}`,
    batch: {
      client_id: clientId,
      upsert_items: rows.map(size => ({
        item_name: name, size, notes,
        prices: priceOf(size) ? [{ year: priceYear, price: Number(priceOf(size)), effective_date: yearStart(priceYear) }] : [],
      })),
    },
  }, { onSuccess: onClose })

  return (
    <Modal title={initialName ? `Add sizes: ${initialName}` : 'Add item'} onClose={onClose} size="md">
      <div className="space-y-4">
        <FormField label="Item name" required>
          <UppercaseField className="field" placeholder="e.g. Kemeja PDH lengan panjang" value={name} onChange={setName} />
        </FormField>
        {!initialName && (
          <FormField label="Notes">
            <UppercaseField className="field" placeholder="Fabric, colour…" value={notes ?? ''} onChange={v => setNotes(v || null)} />
          </FormField>
        )}

        <div>
          <span className="field-label">Sizes</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[...new Set([...PRESET_SIZES, ...sizes])].map(s => (
              <button key={s} type="button" onClick={() => toggle(s)}
                className={`px-3 py-1 rounded-lg text-sm border ${sizes.includes(s) ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {s}
              </button>
            ))}
            <input className="field !w-32 !py-1 text-sm" placeholder="Other: 4XL, 15…" value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              onBlur={addCustom} />
          </div>
          {!sizes.length && <p className="text-xs text-slate-400 mt-1">No size picked: one item without a size.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={sizes.length > 1 ? 'Price for every size' : 'Price'}>
            <input className="field font-mono" inputMode="numeric" placeholder="optional"
              value={formatThousands(allPrice)} onChange={e => setAllPrice(stripCommas(e.target.value))} />
          </FormField>
          <FormField label="For year">
            <input className="field" type="number" value={priceYear} onChange={e => setPriceYear(Number(e.target.value) || priceYear)} />
          </FormField>
        </div>

        {sizes.length > 1 && (
          <div className="border border-slate-100 rounded-xl divide-y divide-slate-50">
            {sizes.map(s => (
              <div key={s} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="w-14 font-medium text-navy-900">{s}</span>
                <input className="field !py-1 font-mono flex-1" inputMode="numeric" placeholder={allPrice ? formatThousands(allPrice) : 'price'}
                  value={own[s] != null ? formatThousands(own[s]) : ''}
                  onChange={e => { const v = stripCommas(e.target.value); setOwn(p => ({ ...p, [s]: v })) }}
                  onBlur={() => setOwn(p => { const n = { ...p }; if (!n[s]) delete n[s]; return n })} />
                {existing.has(exact(name, s)) && <span className="badge-amber text-[10px]">already there: price updated</span>}
                <button className="btn-ghost !p-1" title="Leave out" onClick={() => toggle(s)}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {sizes.length <= 1 && name && existing.has(exact(name, sizes[0] ?? '')) && (
          <p className="text-xs text-amber-700">This item is already in the catalogue: saving sets its {priceYear} price.</p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" disabled={!name.trim() || save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : sizes.length > 1 ? `Add ${sizes.length} sizes` : 'Add item'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
