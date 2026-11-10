import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, BookOpen, Images } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatRp } from '@/components/ui'
import { SI_UNITS } from '@/utils/Units'
import { todayISODate } from '@/utils/MonthUtils'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import { catalogueForSupplier, materialFromText, materialLabel, colorCodeFromText } from '@/data/materialCatalogue'
import { useSupplierCatalogues, supplierDesignHooks } from '@/hooks'
import type { FinanceBatch, FinanceHeader, Order, Supplier } from '@/types'
import { editBatch, supplierLabel, supplierWithCategory, type EditField, type LedgerRow } from './ledgerModel'
import { MaterialColorPicker, CatalogueMaterialPickerModal } from './MaterialColorPicker'
import { DesignPickerModal, DesignThumb } from './DesignPicker'
import { designFromText, designLabel, designsFor } from '@/data/designs'

/** Moves lines to another Kas Bon, or to a new one. */
export function MoveDialog({ rows, headers, saving, onApply, onClose }: {
  rows: LedgerRow[]
  headers: FinanceHeader[]
  saving: boolean
  onApply: (batch: FinanceBatch, label: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [date, setDate] = useState(rows[0]?.date.slice(0, 10) || todayISODate())
  const [description, setDescription] = useState(rows[0]?.description ?? '')
  const target = headers.find(h => h.id === id.trim())
  const apply = () => {
    const headerId = id.trim().toUpperCase()
    if (!headerId) return
    const batch = editBatch(rows, 'header_id', headerId)
    if (!target) batch.new_headers = [{ id: headerId, date, description: description.toUpperCase() }]
    onApply(batch, t('ledger.movedLinesTo', { count: rows.length, id: headerId }))
  }
  return (
    <Modal title={t('ledger.moveLinesTitle', { count: rows.length })} onClose={onClose} size="sm">
      <div className="space-y-3">
        <label className="block">
          <span className="field-label">{t('ledger.toKasBon')}</span>
          <input autoFocus className="field font-mono" list="move-kasbon" value={id} placeholder={suggestNextKasBonId(headers)}
            onChange={e => setId(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && apply()} />
          <datalist id="move-kasbon">{headers.slice(-300).reverse().map(h => <option key={h.id} value={h.id}>{h.description}</option>)}</datalist>
        </label>
        {id.trim() && !target && (
          <div className="rounded-lg bg-amber-50 p-3 space-y-2 dark:bg-amber-500/10">
            <p className="text-xs text-amber-700 dark:text-amber-400">{t('ledger.isNewWillBeCreated', { id: id.trim() })}</p>
            <input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} />
            <input className="field" placeholder={t('ledger.columns.description')} value={description} onChange={e => setDescription(e.target.value.toUpperCase())} />
          </div>
        )}
        <button className="text-xs text-navy-600 hover:underline dark:text-navy-300" onClick={() => setId(suggestNextKasBonId(headers))}>
          {t('ledger.useNextNumber')}
        </button>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={apply} disabled={!id.trim() || saving}>{t('ledger.move')}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Sets one field on many lines: supplier, category or order. */
export function SetFieldDialog({ rows, field, suppliers, orders, categories, saving, onApply, onClose }: {
  rows: LedgerRow[]
  field: 'supplier_id' | 'category' | 'order_id'
  suppliers: Supplier[]
  orders: Order[]
  categories: string[]
  saving: boolean
  onApply: (batch: FinanceBatch, label: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const titleKey = { supplier_id: 'ledger.setSupplierTitle', category: 'ledger.setCategoryTitle', order_id: 'ledger.setOrderTitle' }[field]
  const apply = () => {
    const v = value.trim().toUpperCase()
    if (field === 'supplier_id') {
      if (!value) return setError(t('ledger.pickSupplier'))
      return onApply(editBatch(rows, field, Number(value)), t('ledger.setSupplierOf', { n: rows.length }))
    }
    if (field === 'order_id') {
      if (v && !orders.some(o => o.id === v)) return setError(t('ledger.noOrder', { id: v }))
      return onApply(editBatch(rows, field, v || null), v ? t('ledger.linkedLinesTo', { n: rows.length, id: v }) : t('ledger.unlinkedLines', { n: rows.length }))
    }
    if (!v) return setError(t('ledger.typeCategory'))
    onApply(editBatch(rows, field, v), t('ledger.setCategoryOf', { n: rows.length, value: v }))
  }
  return (
    <Modal title={t(titleKey, { count: rows.length })} onClose={onClose} size="sm">
      <div className="space-y-3">
        {field === 'supplier_id' ? (
          <select autoFocus className="field" value={value} onChange={e => setValue(e.target.value)}>
            <option value="">{t('ledger.supplierPlaceholder')}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
          </select>
        ) : (
          <>
            <input autoFocus className="field font-mono" list="set-field-options" value={value}
              placeholder={field === 'order_id' ? t('ledger.orderIdPlaceholder') : t('ledger.categoryPlaceholder')}
              onChange={e => { setValue(e.target.value.toUpperCase()); setError('') }} onKeyDown={e => e.key === 'Enter' && apply()} />
            <datalist id="set-field-options">
              {field === 'order_id'
                ? orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)
                : categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </>
        )}
        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={apply} disabled={saving}>{t('ledger.apply')}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Edits every field of one line (the phone layout's way to edit). */
export function LineEditor({ row, suppliers, orders, categories, saving, onApply, onDelete, onClose }: {
  row: LedgerRow
  suppliers: Supplier[]
  orders: Order[]
  categories: string[]
  saving: boolean
  onApply: (batch: FinanceBatch, label: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [v, setV] = useState({
    date: row.date.slice(0, 10), description: row.description, name: row.name, supplier_id: row.supplier_id,
    category: row.category, qty: String(row.qty), unit: row.unit, price: String(row.price), order_id: row.order_id ?? '',
  })
  const [error, setError] = useState('')
  const [pickMaterial, setPickMaterial] = useState(false)
  const [pickDesign, setPickDesign] = useState(false)
  const prod = row.kind === 'production'
  const set = (patch: Partial<typeof v>) => { setV(x => ({ ...x, ...patch })); setError('') }

  // Same catalogue/colour lookup the Kas Bon entry form does per line — so
  // fixing an existing line's colour (not just picking one for a new one)
  // has the same picker, not just a plain text field. This dialog is only
  // ever opened from the mobile card list (desktop edits every field,
  // colour included, straight from its own cell in the table), so it stays
  // fully interactive unconditionally.
  const catalogues = useSupplierCatalogues()
  const catalogue = prod ? catalogueForSupplier(supplierLabel(suppliers, v.supplier_id), catalogues) : undefined
  const catMatch = catalogue ? materialFromText(catalogue, v.name) : undefined
  const catCode = catalogue && catMatch ? colorCodeFromText(catMatch, v.name) : undefined
  const catColors = catalogue && catMatch ? catalogue.colorsFor(catMatch) : []
  // A bordir/sablon supplier's designs.
  const { data: allDesigns = [] } = supplierDesignHooks.useList()
  const lineDesigns = prod ? designsFor(allDesigns, v.supplier_id) : []
  const design = lineDesigns.length ? designFromText(lineDesigns, v.supplier_id, v.name) : undefined

  const save = () => {
    const order = v.order_id.trim().toUpperCase()
    if (order && !orders.some(o => o.id === order)) return setError(t('ledger.noOrder', { id: order }))
    const changes: [EditField, unknown][] = []
    const add = (f: EditField, now: unknown, was: unknown) => { if (now !== was) changes.push([f, now]) }
    add('name', v.name.trim().toUpperCase(), row.name)
    add('price', Math.round(Number(v.price) || 0), row.price)
    add('order_id', order || null, row.order_id)
    if (prod) {
      add('supplier_id', v.supplier_id, row.supplier_id)
      add('qty', Number(v.qty.replace(',', '.')) || 0, row.qty)
      add('unit', v.unit, row.unit)
    } else {
      add('category', v.category.trim().toUpperCase(), row.category)
    }
    const batch: FinanceBatch = { production_update: [], operation_update: [] }
    for (const [f, value] of changes) {
      const b = editBatch([row], f, value)
      const fields = Object.assign({}, ...[...(b.production_update ?? []), ...(b.operation_update ?? [])].map(p => p.fields))
      const list = prod ? batch.production_update! : batch.operation_update!
      if (list.length) Object.assign(list[0].fields, fields)
      else list.push({ id: row.id, fields })
    }
    if (v.date !== row.date.slice(0, 10) || v.description !== row.description) {
      batch.header_update = [{ id: row.header_id, date: v.date, description: v.description.toUpperCase() }]
    }
    if (!changes.length && !batch.header_update) return onClose()
    onApply(batch, t('ledger.changedLine', { name: row.name || row.category }))
  }

  const total = prod ? Math.round((Number(v.price) || 0) * (Number(v.qty.replace(',', '.')) || 0)) : Number(v.price) || 0
  return (
    <Modal title={t(prod ? 'ledger.lineEditorTitleBahan' : 'ledger.lineEditorTitleCost', { id: row.header_id })} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label><span className="field-label">{t('ledger.kasBonDate')}</span><input type="date" className="field" value={v.date} onChange={e => set({ date: e.target.value })} /></label>
          <label><span className="field-label">{t('ledger.kasBonDescription')}</span><input className="field" value={v.description} onChange={e => set({ description: e.target.value.toUpperCase() })} /></label>
        </div>
        {prod ? (
          <>
            {/* Supplier first: it decides which catalogue the Bahan comes from. */}
            <label className="block"><span className="field-label">{t('ledger.columns.supplier')}</span>
              <select className="field" value={v.supplier_id || ''} onChange={e => set({ supplier_id: Number(e.target.value) })}>
                <option value="">{t('ledger.supplierPlaceholder')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
              </select>
            </label>
            <label className="block"><span className="field-label">{t('ledger.columns.bahan')}</span><input className="field" value={v.name} onChange={e => set({ name: e.target.value.toUpperCase() })} /></label>
            {lineDesigns.length > 0 && !catMatch && (
              <button type="button" className="btn-secondary btn-sm -mt-1.5" onClick={() => setPickDesign(true)}>
                {design ? <DesignThumb design={design} className="w-5 h-5 rounded" /> : <Images size={14} aria-hidden />}
                {design ? t('designs.changeDesign') : t('designs.pickDesign', { count: lineDesigns.length })}
              </button>
            )}
            {pickDesign && (
              <DesignPickerModal
                supplierName={supplierLabel(suppliers, v.supplier_id) ?? ''}
                designs={lineDesigns}
                currentPrice={Number(v.price) || 0}
                selectedId={design?.id}
                onPick={(d, usePrice) => {
                  set({ name: designLabel(d), unit: 'pcs', ...(usePrice && d.price ? { price: String(d.price) } : {}) })
                  setPickDesign(false)
                }}
                onClose={() => setPickDesign(false)}
              />
            )}
            {catalogue && !catMatch && catalogue.materials.length > 0 && lineDesigns.length === 0 && (
              // Not one of this supplier's materials (typed by hand, or the
              // supplier was just changed): pick it from the catalogue.
              <button type="button" className="btn-secondary btn-sm -mt-1.5" onClick={() => setPickMaterial(true)}>
                <BookOpen size={14} aria-hidden /> {t('ledger.catalogue.pickFrom', { supplier: supplierLabel(suppliers, v.supplier_id) ?? '' })}
              </button>
            )}
            {pickMaterial && catalogue && (
              <CatalogueMaterialPickerModal
                supplierName={supplierLabel(suppliers, v.supplier_id) ?? ''}
                materials={catalogue.materials}
                currentPrice={Number(v.price) || 0}
                onPick={(m, usePrice) => {
                  set({ name: materialLabel(m), ...(usePrice && m.price ? { price: String(m.price) } : {}) })
                  setPickMaterial(false)
                }}
                onClose={() => setPickMaterial(false)}
              />
            )}
            {catalogue && catMatch && (
              <div className="-mt-1.5">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {catMatch.composition}
                  {catMatch.widthCm != null && catMatch.rollYards != null && <> {t('ledger.rollInfo', { width: catMatch.widthCm, yards: catMatch.rollYards })}</>}
                </p>
                {catColors.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400 italic dark:text-navy-600">{t('ledger.noColourList')}</p>
                ) : (
                  <MaterialColorPicker
                    material={catMatch}
                    colors={catColors}
                    selectedCode={catCode}
                    onPick={code => set({ name: `${materialLabel(catMatch)} - ${code}` })}
                  />
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <label><span className="field-label">{t('ledger.columns.qty')}</span><input className="field" inputMode="decimal" value={v.qty} onChange={e => set({ qty: e.target.value.replace(/[^\d.,]/g, '') })} /></label>
              <label><span className="field-label">{t('ledger.columns.unit')}</span>
                <select className="field" value={v.unit} onChange={e => set({ unit: e.target.value })}>
                  {[...new Set([...SI_UNITS, v.unit])].map(u => <option key={u}>{u}</option>)}
                </select>
              </label>
              <label><span className="field-label">{t('ledger.columns.price')}</span><input className="field" inputMode="numeric" value={v.price} onChange={e => set({ price: e.target.value.replace(/\D/g, '') })} /></label>
            </div>
          </>
        ) : (
          <>
            <label className="block"><span className="field-label">{t('ledger.columns.category')}</span>
              <input className="field" list="line-categories" value={v.category} onChange={e => set({ category: e.target.value.toUpperCase() })} />
              <datalist id="line-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="block"><span className="field-label">{t('ledger.columns.item')}</span><input className="field" value={v.name} onChange={e => set({ name: e.target.value.toUpperCase() })} /></label>
            <label className="block"><span className="field-label">{t('ledger.columns.price')}</span><input className="field" inputMode="numeric" value={v.price} onChange={e => set({ price: e.target.value.replace(/\D/g, '') })} /></label>
          </>
        )}
        <label className="block"><span className="field-label">{t('ledger.orderOptional')}</span>
          <input className="field font-mono" list="line-orders" value={v.order_id} onChange={e => set({ order_id: e.target.value.toUpperCase() })} />
          <datalist id="line-orders">{orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)}</datalist>
        </label>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('ledger.columns.total')} <span className="font-mono font-semibold text-navy-900 dark:text-slate-50">{formatRp(total)}</span></p>
        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button className="btn-ghost text-red-600 dark:text-red-400" onClick={onDelete}><Trash2 size={14} /> {t('common.delete')}</button>
          <span className="flex-1" />
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  )
}
