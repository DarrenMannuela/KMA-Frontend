import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Plus, Trash2, ChevronRight, ChevronDown, Palette, FileText, Upload, Pipette, ScanSearch } from 'lucide-react'
import { PhotoColorPicker } from './PhotoColorPicker'
import { ColourReader } from './ColourReader'
import { DesignGallery } from './DesignGallery'
import { DESIGN_CATEGORIES } from '@/data/designs'
import { Modal } from '@/components/ui/Modal'
import { EditableCell, ConfirmDialog, UppercaseField, formatRp } from '@/components/ui'
import { supplierMaterialHooks, supplierMaterialColorHooks, supplierDocumentHooks } from '@/hooks'
import { useDateLocale } from '@/i18n/dateLocale'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Supplier, SupplierMaterial, SupplierMaterialColor, SupplierDocument } from '@/types'

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024

// Phones: an editable cell a finger can hit (44px tall) and 16px text, which
// also stops iPhones zooming in on the field while typing.
const TOUCH_CELL = 'rounded-lg border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900 [&>div]:min-h-[2.75rem] [&>div]:flex [&>div]:items-center [&>div]:text-base [&_input]:!text-base [&_input]:!py-2.5'

/** A labelled field on a phone. */
function TouchField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-xs text-slate-500 mb-1 dark:text-slate-400">{label}</span>
      <div className={TOUCH_CELL}>{children}</div>
    </label>
  )
}

/** The available / not available switch; larger on a phone. */
function AvailableSwitch({ color, onToggle, large = false }: { color: SupplierMaterialColor; onToggle: () => void; large?: boolean }) {
  const { t } = useTranslation()
  const off = color.unavailable
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!off}
      aria-label={t('supplierCatalogue.availableLabel', { code: color.code })}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${large ? 'min-h-[2.75rem] text-sm' : 'text-xs'}`}
    >
      <span className={`relative rounded-full transition-colors ${large ? 'w-11 h-6' : 'w-8 h-[18px]'} ${off ? 'bg-slate-300 dark:bg-navy-700' : 'bg-green-600 dark:bg-green-500'}`} aria-hidden>
        <span className={`absolute rounded-full bg-white shadow transition-[left] ${large ? 'top-[3px] w-[18px] h-[18px]' : 'top-[2px] w-[14px] h-[14px]'} ${
          off ? (large ? 'left-[3px]' : 'left-[2px]') : (large ? 'left-[23px]' : 'left-[16px]')}`} />
      </span>
      <span className={off ? 'text-slate-500 dark:text-slate-400' : 'text-green-700 dark:text-green-400'}>
        {off ? t('supplierCatalogue.unavailable') : t('supplierCatalogue.available')}
      </span>
    </button>
  )
}

/** A colour swatch that opens the colour picker when tapped (phones). */
function SwatchPicker({ hex, onChange, label }: { hex: string; onChange: (hex: string) => void; label: string }) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#888888'
  return (
    <label className="relative block w-11 h-11 shrink-0 rounded-full ring-1 ring-black/10 cursor-pointer dark:ring-white/15" style={{ background: safe }} title={label}>
      <input type="color" value={safe} onChange={e => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label={label} />
    </label>
  )
}
const isImage = (name: string) => /\.(jpe?g|png)$/i.test(name)

/** A supplier's catalogue/price-list documents — separate from the
 *  structured materials below: the originals themselves (as the supplier
 *  sent them), not data entered from reading them. Not every supplier has
 *  a clean PDF — an embroidery supplier, say, may only have photos of its
 *  materials — so a plain photo is accepted too. Upload always adds a new
 *  one rather than replacing — a supplier can have a catalogue and a
 *  separate price list, or several years' editions. */
function DocumentList({ supplier, readColours = true }: { supplier: Supplier; readColours?: boolean }) {
  const { data: docs = [], isLoading } = supplierDocumentHooks.useBySupplier(supplier.id)
  const upload = supplierDocumentHooks.useUpload()
  const del = supplierDocumentHooks.useDelete()
  const [confirmDelete, setConfirmDelete] = useState<SupplierDocument | null>(null)
  const [reading, setReading] = useState<SupplierDocument | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dateLocale = useDateLocale()
  const { t } = useTranslation()

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error(t('supplierCatalogue.fileTooLarge'))
      return
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      toast.error(t('supplierCatalogue.unsupportedFileType'))
      return
    }
    upload.mutate({ supplierId: supplier.id, file })
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5 dark:text-slate-500">
        <FileText size={11} /> {t('supplierCatalogue.documentsHeading')}
      </p>
      {isLoading ? (
        <p className="text-xs text-slate-400 italic dark:text-navy-600">{t('common.loading')}</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-400 italic dark:text-navy-600">{t('supplierCatalogue.noDocuments')}</p>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            // On a phone the buttons go on their own line, full size, so the
            // name keeps the width and nothing is a fingertip target.
            <div key={d.id} className="flex flex-wrap dock:flex-nowrap items-center gap-x-2 gap-y-1 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5 dark:bg-navy-950">
              {isImage(d.file_name) ? (
                <img src={d.file_path} alt="" className="w-7 h-7 rounded object-cover shrink-0 border border-slate-200 dark:border-navy-800" />
              ) : (
                <FileText size={14} className="text-slate-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0 flex flex-col dock:flex-row dock:items-center dock:gap-2">
                <a
                  href={d.file_path} target="_blank" rel="noopener noreferrer" download={d.file_name}
                  className="truncate text-navy-700 hover:underline dark:text-slate-200 dock:flex-1" title={d.file_name}
                >
                  {d.file_name}
                </a>
                <span className="text-xs text-slate-400 shrink-0 dark:text-navy-600">
                  {format(new Date(d.uploaded_at), 'd MMM yyyy', { locale: dateLocale })}
                </span>
              </div>
              <div className="w-full dock:w-auto flex items-center justify-end gap-1 shrink-0">
                {readColours && <button type="button" onClick={() => setReading(d)} className="btn-ghost btn-sm min-h-[2.75rem] !px-3 dock:min-h-0 dock:!px-2 text-navy-700 dark:text-slate-200" title={t('colourReader.readColoursHint')}>
                  <ScanSearch size={14} aria-hidden /> <span>{t('colourReader.readColours')}</span>
                </button>}
                <button onClick={() => setConfirmDelete(d)} className="w-11 h-11 dock:w-8 dock:h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-navy-600 dark:hover:bg-red-500/10" title={t('supplierCatalogue.deleteDocument')} aria-label={t('supplierCatalogue.deleteDocument')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={onPick} />
      <button className="btn-secondary btn-sm min-h-[2.75rem] w-full justify-center dock:min-h-0 dock:w-auto" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
        <Upload size={14} /> {upload.isPending ? t('supplierCatalogue.uploading') : t('supplierCatalogue.uploadPdfOrPhoto')}
      </button>
      {reading && <ColourReader supplier={supplier} document={reading} onClose={() => setReading(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          message={t('supplierCatalogue.deleteFileConfirm', { name: confirmDelete.file_name })}
          onConfirm={() => { del.mutate({ id: confirmDelete.id, supplierId: supplier.id }); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

/** One material's colour list — its own small table, add row, and delete,
 *  the same click-to-edit cells the rest of the app uses. Shown only once
 *  its material row is expanded (see MaterialRow). */
function ColorList({ material }: { material: SupplierMaterial }) {
  const { data: colors = [] } = supplierMaterialColorHooks.useByMaterial(material.id)
  const create = supplierMaterialColorHooks.useCreate()
  const update = supplierMaterialColorHooks.useUpdate()
  const del = supplierMaterialColorHooks.useDelete()
  const [confirmDelete, setConfirmDelete] = useState<SupplierMaterialColor | null>(null)
  const [newCode, setNewCode] = useState('')
  const [newHex, setNewHex] = useState('#888888')
  // Which colour "Pick from photo" is for: an existing one, or the new row.
  const [photoFor, setPhotoFor] = useState<SupplierMaterialColor | 'new' | null>(null)
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const addColor = () => {
    if (!newCode.trim()) return
    create.mutate(
      { supplier_material_id: material.id, code: newCode.trim().toUpperCase(), category: null, hex: newHex },
      { onSuccess: () => setNewCode('') },
    )
  }

  const dialogs = (
    <>
      {photoFor && (
        <PhotoColorPicker
          supplierId={material.supplier_id}
          colourLabel={photoFor === 'new' ? (newCode.trim() || undefined) : photoFor.code}
          onPick={hex => {
            if (photoFor === 'new') setNewHex(hex)
            else update.mutate({ id: photoFor.id, body: { hex } })
            setPhotoFor(null)
          }}
          onClose={() => setPhotoFor(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={t('supplierCatalogue.deleteColourConfirm', { code: confirmDelete.code })}
          onConfirm={() => { del.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )

  // Phones: each colour is a small card — a big swatch to tap for the
  // colour picker, its code and category, the availability switch, and a
  // row of full-size buttons — instead of seven columns of 24px targets.
  if (isMobile) {
    return (
      <div className="space-y-2">
        {colors.length === 0 && <p className="text-sm text-slate-500 italic dark:text-slate-400">{t('supplierCatalogue.noColours')}</p>}
        {colors.map(c => (
          <div key={c.id} className={`rounded-xl border p-2.5 ${c.unavailable ? 'border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-950' : 'border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900'}`}>
            <div className="flex items-start gap-3">
              <div className={`pt-1 ${c.unavailable ? 'opacity-45' : ''}`}>
                <SwatchPicker hex={c.hex} label={`${t('supplierCatalogue.pickColour')}: ${c.code}`} onChange={hex => update.mutate({ id: c.id, body: { hex } })} />
              </div>
              <div className={`flex-1 min-w-0 space-y-1.5 ${c.unavailable ? 'opacity-60' : ''}`}>
                <div className={`${TOUCH_CELL} [&>div]:font-semibold`}>
                  <EditableCell value={c.code} uppercase placeholder={t('supplierCatalogue.code')} onSave={v => update.mutate({ id: c.id, body: { code: String(v) } })} />
                </div>
                <div className={TOUCH_CELL}>
                  <EditableCell value={c.category ?? ''} uppercase placeholder={t('supplierCatalogue.categoryOptional')} onSave={v => update.mutate({ id: c.id, body: { category: String(v) || null } })} />
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AvailableSwitch large color={c} onToggle={() => update.mutate({ id: c.id, body: { unavailable: !c.unavailable } })} />
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => setPhotoFor(c)} className="btn-secondary btn-sm min-h-[2.75rem] !px-3" aria-label={`${t('photoColour.pickFromPhoto')}: ${c.code}`}>
                  <Pipette size={15} aria-hidden /> {t('photoColour.pickFromPhoto')}
                </button>
                <button onClick={() => setConfirmDelete(c)} className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-navy-600 dark:hover:bg-red-500/10" aria-label={`${t('supplierCatalogue.deleteColour')}: ${c.code}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-slate-300 p-2.5 space-y-2 dark:border-navy-700">
          <div className="flex items-center gap-3">
            <SwatchPicker hex={newHex} label={t('supplierCatalogue.pickColour')} onChange={setNewHex} />
            <UppercaseField className="field flex-1 !text-base !py-2.5" placeholder={t('supplierCatalogue.code')} value={newCode} onChange={setNewCode} onKeyDown={e => e.key === 'Enter' && addColor()} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhotoFor('new')} className="btn-secondary flex-1 min-h-[2.75rem] justify-center">
              <Pipette size={15} aria-hidden /> {t('photoColour.pickFromPhoto')}
            </button>
            <button onClick={addColor} disabled={!newCode.trim() || create.isPending} className="btn-primary flex-1 min-h-[2.75rem] justify-center">
              <Plus size={15} aria-hidden /> {t('supplierCatalogue.addColour')}
            </button>
          </div>
        </div>
        {dialogs}
      </div>
    )
  }

  return (
    <div className="pl-6 pr-2 pb-2 space-y-1.5">
      {colors.length === 0 && <p className="text-xs text-slate-400 italic dark:text-navy-600">{t('supplierCatalogue.noColours')}</p>}
      {colors.map(c => (
        <div key={c.id} className={`grid grid-cols-[1.5rem_minmax(5rem,1.2fr)_minmax(0,1fr)_5.5rem_2rem_auto_2rem] gap-2 items-center text-sm ${c.unavailable ? '[&>*:nth-child(-n+4)]:opacity-45' : ''}`}>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888'}
            onChange={e => update.mutate({ id: c.id, body: { hex: e.target.value } })}
            className="w-6 h-6 rounded-full border-0 p-0 cursor-pointer"
            title={t('supplierCatalogue.pickColour')}
          />
          <EditableCell
            value={c.code} uppercase placeholder={t('supplierCatalogue.code')}
            onSave={v => update.mutate({ id: c.id, body: { code: String(v) } })}
          />
          <EditableCell
            value={c.category ?? ''} uppercase placeholder={t('supplierCatalogue.categoryOptional')}
            onSave={v => update.mutate({ id: c.id, body: { category: String(v) || null } })}
          />
          <EditableCell
            value={c.hex} placeholder="#rrggbb"
            onSave={v => update.mutate({ id: c.id, body: { hex: String(v) } })}
          />
          <button type="button" onClick={() => setPhotoFor(c)} className="w-8 h-8 -m-1 flex items-center justify-center rounded text-slate-400 hover:text-navy-700 hover:bg-slate-100 dark:hover:bg-white/5 dark:hover:text-slate-200" title={t('photoColour.pickFromPhoto')} aria-label={`${t('photoColour.pickFromPhoto')}: ${c.code}`}>
            <Pipette size={14} />
          </button>
          {/* On = the supplier still has it. Off keeps it in the catalogue
              (old lines name it) but it can't be picked for a new line. */}
          <AvailableSwitch color={c} onToggle={() => update.mutate({ id: c.id, body: { unavailable: !c.unavailable } })} />
          <button onClick={() => setConfirmDelete(c)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title={t('supplierCatalogue.deleteColour')} aria-label={t('supplierCatalogue.deleteColour')}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[1.5rem_minmax(5rem,1.2fr)_minmax(0,1fr)_5.5rem_2rem_auto_2rem] gap-2 items-center pt-1">
        <input type="color" value={newHex} onChange={e => setNewHex(e.target.value)} className="w-6 h-6 rounded-full border-0 p-0 cursor-pointer" />
        <UppercaseField className="field !py-1 !text-xs" placeholder={t('supplierCatalogue.code')} value={newCode} onChange={setNewCode} onKeyDown={e => e.key === 'Enter' && addColor()} />
        <span />
        <span />
        <button type="button" onClick={() => setPhotoFor('new')} className="w-8 h-8 -m-1 flex items-center justify-center rounded text-slate-400 hover:text-navy-700 hover:bg-slate-100 dark:hover:bg-white/5 dark:hover:text-slate-200" title={t('photoColour.pickFromPhoto')} aria-label={t('photoColour.pickFromPhoto')}>
          <Pipette size={14} />
        </button>
        <span />
        <button onClick={addColor} disabled={!newCode.trim() || create.isPending} className="text-navy-500 hover:text-navy-700 disabled:opacity-30 dark:text-navy-400" title={t('supplierCatalogue.addColour')} aria-label={t('supplierCatalogue.addColour')}>
          <Plus size={14} />
        </button>
      </div>
      {dialogs}
    </div>
  )
}

/** One material: its own editable fields, plus an expandable colour list. */
function MaterialRow({ material }: { material: SupplierMaterial }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = supplierMaterialHooks.useUpdate()
  const del = supplierMaterialHooks.useDelete()
  const save = (body: Partial<SupplierMaterial>) => update.mutate({ id: material.id, body })
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const confirm = confirmDelete && (
    <ConfirmDialog
      message={t('supplierCatalogue.deleteMaterialConfirm', { name: material.name })}
      onConfirm={() => { del.mutate(material.id); setConfirmDelete(false) }}
      onCancel={() => setConfirmDelete(false)}
    />
  )

  // Phones: a card. The whole header (name, brand, price) opens it; inside,
  // every field is labelled and full size, then its colours, then Delete.
  if (isMobile) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white dark:border-navy-800 dark:bg-navy-900">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[3.5rem] text-left">
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold text-navy-900 break-words dark:text-slate-50">{material.name || t('supplierCatalogue.materialName')}</span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              {[material.brand, material.price ? formatRp(material.price) : null].filter(Boolean).join(' · ') || t('supplierCatalogue.tapToEdit')}
            </span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {open && (
          <div className="border-t border-slate-100 px-3.5 pt-3 pb-3.5 space-y-3 dark:border-navy-800">
            <TouchField label={t('supplierCatalogue.materialName')}>
              <EditableCell value={material.name} uppercase placeholder={t('supplierCatalogue.materialName')} onSave={v => save({ name: String(v) })} />
            </TouchField>
            <div className="grid grid-cols-2 gap-2.5">
              <TouchField label={t('supplierCatalogue.brand')}>
                <EditableCell value={material.brand ?? ''} uppercase placeholder="—" onSave={v => save({ brand: String(v) || null })} />
              </TouchField>
              <TouchField label={t('supplierCatalogue.price')}>
                <EditableCell type="number" value={material.price} placeholder="0" format={v => <span className="font-mono tabular-nums">{formatRp(Number(v))}</span>} onSave={v => save({ price: Number(v) || 0 })} />
              </TouchField>
              <TouchField label={t('supplierCatalogue.composition')}>
                <EditableCell value={material.composition ?? ''} uppercase placeholder="—" onSave={v => save({ composition: String(v) || null })} />
              </TouchField>
              <TouchField label={t('supplierCatalogue.usedFor')}>
                <EditableCell value={material.used_for ?? ''} uppercase placeholder="—" onSave={v => save({ used_for: String(v) || null })} />
              </TouchField>
              <TouchField label={t('supplierCatalogue.width')}>
                <EditableCell type="number" value={material.width_cm ?? ''} placeholder="—" onSave={v => save({ width_cm: Number(v) || null })} />
              </TouchField>
              <TouchField label={t('supplierCatalogue.roll')}>
                <EditableCell type="number" value={material.roll_yards ?? ''} placeholder="—" onSave={v => save({ roll_yards: Number(v) || null })} />
              </TouchField>
            </div>
            <p className="pt-1 text-xs font-semibold text-slate-600 flex items-center gap-1.5 dark:text-slate-300">
              <Palette size={13} aria-hidden /> {t('supplierCatalogue.colours')}
            </p>
            <ColorList material={material} />
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="w-full min-h-[2.75rem] flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
              <Trash2 size={15} aria-hidden /> {t('supplierCatalogue.deleteMaterial')}
            </button>
          </div>
        )}
        {confirm}
      </div>
    )
  }

  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-navy-800">
      <div className="grid grid-cols-[1.25rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_1.5rem] gap-2 items-center px-1 py-1.5">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500" aria-label={open ? t('supplierCatalogue.collapse') : t('supplierCatalogue.expand')}>
          <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <EditableCell value={material.name} uppercase placeholder={t('supplierCatalogue.materialName')} onSave={v => save({ name: String(v) })} />
        <EditableCell value={material.brand ?? ''} uppercase placeholder={t('supplierCatalogue.brand')} onSave={v => save({ brand: String(v) || null })} />
        <EditableCell
          type="number" value={material.price} placeholder={t('supplierCatalogue.price')}
          format={v => <span className="font-mono tabular-nums">{formatRp(Number(v))}</span>}
          onSave={v => save({ price: Number(v) || 0 })}
        />
        <button onClick={() => setConfirmDelete(true)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title={t('supplierCatalogue.deleteMaterial')} aria-label={t('supplierCatalogue.deleteMaterial')}>
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="pb-2">
          <div className="pl-6 pr-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">{t('supplierCatalogue.composition')}
              <EditableCell value={material.composition ?? ''} uppercase placeholder={t('supplierCatalogue.compositionPlaceholder')} onSave={v => save({ composition: String(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">{t('supplierCatalogue.usedFor')}
              <EditableCell value={material.used_for ?? ''} uppercase placeholder={t('supplierCatalogue.usedForPlaceholder')} onSave={v => save({ used_for: String(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">{t('supplierCatalogue.width')}
              {/* EditableCell already coerces a number cell's value before
                 calling onSave, so an emptied field arrives here as 0, not
                 '' — `|| null` turns that back into "no width recorded"
                 rather than saving a literal 0. */}
              <EditableCell type="number" value={material.width_cm ?? ''} placeholder="—" onSave={v => save({ width_cm: Number(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">{t('supplierCatalogue.roll')}
              <EditableCell type="number" value={material.roll_yards ?? ''} placeholder="—" onSave={v => save({ roll_yards: Number(v) || null })} />
            </label>
          </div>
          <p className="pl-6 pr-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1.5 dark:text-slate-500">
            <Palette size={11} /> {t('supplierCatalogue.colours')}
          </p>
          <ColorList material={material} />
        </div>
      )}
      {confirm}
    </div>
  )
}

/** A supplier's own catalogue — materials, colours, the current price per
 *  material, and the original catalogue/price-list PDFs. Anything added
 *  here shows up immediately in the Kas Bon colour picker and the Ledger's
 *  own swatch, via useSupplierCatalogues. */
export function SupplierCatalogueModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { data: materials = [], isLoading } = supplierMaterialHooks.useBySupplier(supplier.id)
  const create = supplierMaterialHooks.useCreate()
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const { t } = useTranslation()
  // Bordir and sablon suppliers work from photos of designs (logos,
  // slogans), not materials and colours: their catalogue is a gallery.
  const designMode = DESIGN_CATEGORIES.has(supplier.supplier_category)

  const addMaterial = () => {
    if (!newName.trim()) return
    create.mutate(
      { supplier_id: supplier.id, name: newName.trim().toUpperCase(), brand: newBrand.trim() || null, composition: null, used_for: null, width_cm: null, roll_yards: null, price: 0 },
      { onSuccess: () => { setNewName(''); setNewBrand('') } },
    )
  }

  return (
    <Modal title={t('supplierCatalogue.title', { name: supplier.supplier_name })} onClose={onClose} size="xl" guard={false}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {designMode ? t('designs.intro') : t('supplierCatalogue.intro')}
        </p>
        {designMode && <DesignGallery supplier={supplier} />}
        {designMode && <hr className="border-slate-100 dark:border-navy-800" />}
        <DocumentList supplier={supplier} readColours={!designMode} />
        {/* A bordir/sablon supplier only sees materials if it already has some. */}
        {(!designMode || materials.length > 0) && <>
        <hr className="border-slate-100 dark:border-navy-800" />
        {/* Stacked on a phone, full width, so each field is a real size. */}
        <div className="flex flex-col dock:flex-row dock:items-end gap-2 bg-slate-50 rounded-lg p-2.5 dark:bg-navy-950">
          <label className="dock:flex-1">
            <span className="field-label">{t('supplierCatalogue.newMaterial')}</span>
            <UppercaseField className="field !py-2.5 !text-base dock:!py-1.5 dock:!text-sm" placeholder={t('supplierCatalogue.newMaterialPlaceholder')} value={newName} onChange={setNewName} onKeyDown={e => e.key === 'Enter' && addMaterial()} />
          </label>
          <label className="dock:w-40">
            <span className="field-label">{t('supplierCatalogue.brandOptional')}</span>
            <UppercaseField className="field !py-2.5 !text-base dock:!py-1.5 dock:!text-sm" placeholder={t('supplierCatalogue.brandPlaceholder')} value={newBrand} onChange={setNewBrand} onKeyDown={e => e.key === 'Enter' && addMaterial()} />
          </label>
          <button className="btn-primary btn-sm min-h-[2.75rem] justify-center dock:min-h-0" disabled={!newName.trim() || create.isPending} onClick={addMaterial}>
            <Plus size={14} /> {t('supplierCatalogue.add')}
          </button>
        </div>
        {/* A list of cards on a phone, scrolling with the sheet; a table with
            its own scroll on a computer. */}
        <div className="space-y-2 dock:space-y-0 dock:border dock:border-slate-100 dock:rounded-lg dock:max-h-[50vh] dock:overflow-y-auto dark:dock:border-navy-800">
          {isLoading ? (
            <p className="p-4 text-sm text-slate-400 text-center">{t('common.loading')}</p>
          ) : materials.length === 0 ? (
            <p className="p-6 text-sm text-slate-400 text-center">{t('supplierCatalogue.noMaterials')}</p>
          ) : (
            materials.map(m => <MaterialRow key={m.id} material={m} />)
          )}
        </div>
        </>}
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </Modal>
  )
}
