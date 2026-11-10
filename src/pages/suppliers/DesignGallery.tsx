import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog, UppercaseField } from '@/components/ui'
import { supplierDesignHooks } from '@/hooks'
import { supplierDesignApi } from '@/api'
import { friendlyError } from '@/utils/friendlyError'
import { DesignThumb } from '@/components/finance/DesignPicker'
import type { Supplier, SupplierDesign } from '@/types'

const MAX_PHOTO = 10 * 1024 * 1024
const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

interface Draft { name: string; placement: string; size: string; price: string; notes: string }
const emptyDraft: Draft = { name: '', placement: '', size: '', price: '', notes: '' }
const toBody = (d: Draft) => ({
  name: d.name.trim(),
  placement: d.placement.trim() || null,
  size: d.size.trim() || null,
  price: Number(d.price) || 0,
  notes: d.notes.trim() || null,
})

/** The fields of a design, shared by "add" and "edit". */
function DesignFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2">
        <span className="field-label">{t('designs.name')}</span>
        <UppercaseField className="field" value={draft.name} onChange={v => set({ name: v })} placeholder={t('designs.namePlaceholder')} />
      </label>
      <label>
        <span className="field-label">{t('designs.placement')}</span>
        <UppercaseField className="field" value={draft.placement} onChange={v => set({ placement: v })} placeholder={t('designs.placementPlaceholder')} />
      </label>
      <label>
        <span className="field-label">{t('designs.size')}</span>
        <UppercaseField className="field" value={draft.size} onChange={v => set({ size: v })} placeholder={t('designs.sizePlaceholder')} />
      </label>
      <label>
        <span className="field-label">{t('designs.price')}</span>
        <input className="field font-mono text-right" inputMode="numeric" value={draft.price ? Number(draft.price).toLocaleString('id-ID') : ''}
          onChange={e => set({ price: e.target.value.replace(/\D/g, '') })} placeholder="0" />
      </label>
      <label>
        <span className="field-label">{t('designs.notes')}</span>
        <input className="field" value={draft.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('designs.notesPlaceholder')} />
      </label>
    </div>
  )
}

/** Choosing a photo: checked here for size and type, and again by the server for what it really is. */
function usePhotoPicker(onFile: (file: File) => void) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input ref={ref} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      if (file.size > MAX_PHOTO) return void toast.error(t('designs.photoTooLarge'))
      if (!/\.(jpe?g|png)$/i.test(file.name)) return void toast.error(t('designs.photoType'))
      onFile(file)
    }} />
  )
  return { input, open: () => ref.current?.click() }
}

function DesignEditor({ design, onClose }: { design: SupplierDesign; onClose: () => void }) {
  const { t } = useTranslation()
  const update = supplierDesignHooks.useUpdate()
  const upload = supplierDesignHooks.useUploadPhoto()
  const removePhoto = supplierDesignHooks.useDeletePhoto()
  const [draft, setDraft] = useState<Draft>({ name: design.name, placement: design.placement ?? '', size: design.size ?? '', price: String(design.price || ''), notes: design.notes ?? '' })
  const photo = usePhotoPicker(file => upload.mutate({ id: design.id, file }))
  const current = supplierDesignHooks.useBySupplier(design.supplier_id).data?.find(d => d.id === design.id) ?? design

  return (
    <Modal title={t('designs.editTitle')} onClose={onClose} guard={false}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <DesignThumb design={current} className="w-28 h-20 rounded-lg shrink-0" />
          <div className="flex flex-wrap gap-2">
            {photo.input}
            <button type="button" className="btn-secondary btn-sm" disabled={upload.isPending} onClick={photo.open}>
              <Camera size={14} aria-hidden /> {upload.isPending ? t('designs.uploading') : current.photo_path ? t('designs.replacePhoto') : t('designs.addPhoto')}
            </button>
            {current.photo_path && (
              <button type="button" className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => removePhoto.mutate(design.id)}>{t('designs.removePhoto')}</button>
            )}
          </div>
        </div>
        <DesignFields draft={draft} set={p => setDraft(d => ({ ...d, ...p }))} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={!draft.name.trim() || update.isPending}
            onClick={() => update.mutate({ id: design.id, body: toBody(draft) }, { onSuccess: onClose })}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** A bordir/sablon supplier's catalogue: its designs (logos, slogans), each
 *  with a photo, where it goes, its size and the price per piece. A Kas Bon
 *  line picks one of these the way a fabric line picks a colour. */
export function DesignGallery({ supplier }: { supplier: Supplier }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: designs = [], isLoading } = supplierDesignHooks.useBySupplier(supplier.id)
  const del = supplierDesignHooks.useDelete()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [newPhoto, setNewPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SupplierDesign | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SupplierDesign | null>(null)
  const photo = usePhotoPicker(setNewPhoto)
  // One preview link per chosen photo, released when it changes.
  const preview = useMemo(() => (newPhoto ? URL.createObjectURL(newPhoto) : null), [newPhoto])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const add = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      // The design first, then its photo (named after the design's id).
      const created = await supplierDesignApi.create({ supplier_id: supplier.id, ...toBody(draft) })
      if (newPhoto) {
        try { await supplierDesignApi.uploadPhoto(created.id, newPhoto) } catch (e) { toast.error(friendlyError(e as Error)) }
      }
      await qc.invalidateQueries({ queryKey: ['supplier-designs'] })
      toast.success(t('designs.added', { name: created.name }))
      setDraft(emptyDraft); setNewPhoto(null); setAdding(false)
    } catch (e) {
      toast.error(friendlyError(e as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('designs.heading', { count: designs.length })}</p>
        {!adding && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> {t('designs.add')}
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-3 dark:border-navy-700">
          <div className="flex items-center gap-3">
            {preview
              ? <img src={preview} alt="" className="w-28 h-20 rounded-lg object-cover shrink-0" />
              : <DesignThumb design={{ photo_path: null }} className="w-28 h-20 rounded-lg shrink-0" />}
            {photo.input}
            <button type="button" className="btn-secondary btn-sm" onClick={photo.open}>
              <Camera size={14} aria-hidden /> {newPhoto ? t('designs.replacePhoto') : t('designs.addPhoto')}
            </button>
          </div>
          <DesignFields draft={draft} set={p => setDraft(d => ({ ...d, ...p }))} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setAdding(false); setDraft(emptyDraft); setNewPhoto(null) }}>{t('common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!draft.name.trim() || saving} onClick={add}>
              <Plus size={14} aria-hidden /> {t('designs.save')}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
      ) : designs.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-navy-700 dark:text-slate-400">{t('designs.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {designs.map(d => (
            <div key={d.id} className="group rounded-xl border border-slate-200 overflow-hidden dark:border-navy-700">
              <button type="button" className="block w-full" onClick={() => setEditing(d)} title={t('designs.editTitle')}>
                <DesignThumb design={d} className="w-full aspect-[4/3]" />
              </button>
              <div className="px-2.5 py-2">
                <p className="text-sm font-medium text-navy-900 leading-snug dark:text-slate-50">{d.name}</p>
                {(d.placement || d.size) && <p className="text-xs text-slate-500 dark:text-slate-400">{[d.placement, d.size].filter(Boolean).join(' · ')}</p>}
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs font-mono text-slate-700 flex-1 dark:text-slate-300">{d.price ? t('designs.perPiece', { price: rp(d.price) }) : '—'}</span>
                  <button type="button" onClick={() => setEditing(d)} className="p-1.5 rounded text-slate-400 hover:text-navy-700 hover:bg-slate-100 dark:hover:bg-white/5" aria-label={`${t('designs.editTitle')}: ${d.name}`}><Pencil size={13} /></button>
                  <button type="button" onClick={() => setConfirmDelete(d)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label={`${t('designs.delete')}: ${d.name}`}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <DesignEditor design={editing} onClose={() => setEditing(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          message={t('designs.deleteConfirm', { name: confirmDelete.name })}
          onConfirm={() => { del.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
