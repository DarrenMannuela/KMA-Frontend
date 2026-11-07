import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    label: sizes.length ? t('catalogue.add.addedSizes', { name: name.trim(), count: sizes.length }) : t('catalogue.add.added', { name: name.trim() }),
    batch: {
      client_id: clientId,
      upsert_items: rows.map(size => ({
        item_name: name, size, notes,
        prices: priceOf(size) ? [{ year: priceYear, price: Number(priceOf(size)), effective_date: yearStart(priceYear) }] : [],
      })),
    },
  }, { onSuccess: onClose })

  return (
    <Modal title={initialName ? t('catalogue.add.addSizesTitle', { name: initialName }) : t('catalogue.addItem')} onClose={onClose} size="md">
      <div className="space-y-4">
        <FormField label={t('catalogue.add.itemName')} required>
          <UppercaseField className="field" placeholder={t('catalogue.add.itemNamePlaceholder')} value={name} onChange={setName} />
        </FormField>
        {!initialName && (
          <FormField label={t('catalogue.item.notes')}>
            <UppercaseField className="field" placeholder={t('catalogue.add.notesPlaceholder')} value={notes ?? ''} onChange={v => setNotes(v || null)} />
          </FormField>
        )}

        <div>
          <span className="field-label">{t('catalogue.add.sizes')}</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[...new Set([...PRESET_SIZES, ...sizes])].map(s => (
              <button key={s} type="button" onClick={() => toggle(s)}
                className={`px-3 py-1 rounded-lg text-sm border ${sizes.includes(s) ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-navy-900 dark:text-slate-300 dark:border-navy-700 dark:hover:border-navy-600'}`}>
                {s}
              </button>
            ))}
            <input className="field !w-32 !py-1 text-sm" placeholder={t('catalogue.add.otherSizes')} value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              onBlur={addCustom} />
          </div>
          {!sizes.length && <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">{t('catalogue.add.noSizePicked')}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={sizes.length > 1 ? t('catalogue.add.priceEverySize') : t('orders.detail.price')}>
            <input className="field font-mono" inputMode="numeric" placeholder={t('catalogue.add.optional')}
              value={formatThousands(allPrice)} onChange={e => setAllPrice(stripCommas(e.target.value))} />
          </FormField>
          <FormField label={t('catalogue.add.forYear')}>
            <input className="field" type="number" value={priceYear} onChange={e => setPriceYear(Number(e.target.value) || priceYear)} />
          </FormField>
        </div>

        {sizes.length > 1 && (
          <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 dark:border-navy-800 dark:divide-navy-800/60">
            {sizes.map(s => (
              <div key={s} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="w-14 font-medium text-navy-900 dark:text-slate-100">{s}</span>
                <input className="field !py-1 font-mono flex-1" inputMode="numeric" placeholder={allPrice ? formatThousands(allPrice) : t('catalogue.item.pricePlaceholder')}
                  value={own[s] != null ? formatThousands(own[s]) : ''}
                  onChange={e => { const v = stripCommas(e.target.value); setOwn(p => ({ ...p, [s]: v })) }}
                  onBlur={() => setOwn(p => { const n = { ...p }; if (!n[s]) delete n[s]; return n })} />
                {existing.has(exact(name, s)) && <span className="badge-amber text-[10px]">{t('catalogue.add.alreadyThere')}</span>}
                <button className="btn-ghost !p-1" title={t('catalogue.add.leaveOut')} aria-label={t('catalogue.add.leaveOut')} onClick={() => toggle(s)}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {sizes.length <= 1 && name && existing.has(exact(name, sizes[0] ?? '')) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">{t('catalogue.add.alreadyInCatalogue', { year: priceYear })}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" disabled={!name.trim() || save.isPending} onClick={submit}>
            {save.isPending ? t('common.saving') : sizes.length > 1 ? t('catalogue.add.addSizesButton', { count: sizes.length }) : t('catalogue.addItem')}
          </button>
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
