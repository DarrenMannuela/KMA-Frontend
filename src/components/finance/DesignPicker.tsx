import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight'
import { designLabel } from '@/data/designs'
import type { SupplierDesign } from '@/types'

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

/** A design's photo, or a plain placeholder when it has none yet. */
export function DesignThumb({ design, className = '' }: { design: Pick<SupplierDesign, 'photo_path'>; className?: string }) {
  return design.photo_path
    ? <img src={design.photo_path} alt="" className={`object-cover bg-slate-100 dark:bg-navy-950 ${className}`} loading="lazy" />
    : <span className={`flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-navy-950 dark:text-navy-600 ${className}`}><ImageOff size={16} aria-hidden /></span>
}

/** Picking which of a bordir/sablon supplier's designs a Kas Bon line is:
 *  photos first, since that's how these jobs are recognised. Hands back the
 *  design, and whether to take its price per piece too. */
export function DesignPickerModal({ supplierName, designs, currentPrice, selectedId, onPick, onClose }: {
  supplierName: string
  designs: SupplierDesign[]
  currentPrice: number
  selectedId?: number
  onPick: (design: SupplierDesign, usePrice: boolean) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const viewportHeight = useVisualViewportHeight()
  const [query, setQuery] = useState('')
  const [usePrice, setUsePrice] = useState(true)
  const q = query.trim().toLowerCase()
  const shown = q ? designs.filter(d => designLabel(d).toLowerCase().includes(q) || (d.notes ?? '').toLowerCase().includes(q)) : designs

  return (
    <Modal title={t('designs.pickerTitle', { supplier: supplierName })} onClose={onClose} size="lg" guard={false}>
      <div className="space-y-3">
        {designs.length > 6 && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden />
            <input autoFocus={!isMobile} type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t('designs.search')} aria-label={t('designs.search')} className="field !pl-9" />
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={usePrice} onChange={e => setUsePrice(e.target.checked)} />
          <span>
            {t('designs.usePrice')}
            <span className="block text-xs text-slate-500 dark:text-slate-400">{t('ledger.catalogue.currentPrice', { price: rp(currentPrice) })}</span>
          </span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: Math.max(220, viewportHeight * 0.55) }}>
          {shown.map(d => (
            <button key={d.id} type="button" onClick={() => onPick(d, usePrice)}
              className={`text-left rounded-xl border overflow-hidden transition-colors hover:border-navy-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-400 ${selectedId === d.id ? 'border-navy-700 ring-1 ring-navy-700 dark:border-navy-300 dark:ring-navy-300' : 'border-slate-200 dark:border-navy-700'}`}>
              <DesignThumb design={d} className="w-full aspect-[4/3]" />
              <span className="block px-2.5 py-2">
                <span className="block text-sm font-medium text-navy-900 leading-snug dark:text-slate-50">{d.name}</span>
                {(d.placement || d.size) && <span className="block text-xs text-slate-500 dark:text-slate-400">{[d.placement, d.size].filter(Boolean).join(' · ')}</span>}
                {d.price > 0 && <span className="block mt-0.5 text-xs font-mono text-slate-700 dark:text-slate-300">{t('designs.perPiece', { price: rp(d.price) })}</span>}
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('ledger.colourPicker.noMatch', { query })}</p>}
        </div>
      </div>
    </Modal>
  )
}
