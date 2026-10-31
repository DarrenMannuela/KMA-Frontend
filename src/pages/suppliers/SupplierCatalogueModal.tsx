import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, Trash2, ChevronRight, Palette, FileText, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { EditableCell, ConfirmDialog, UppercaseField, formatRp } from '@/components/ui'
import { supplierMaterialHooks, supplierMaterialColorHooks, supplierDocumentHooks } from '@/hooks'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Supplier, SupplierMaterial, SupplierMaterialColor, SupplierDocument } from '@/types'

const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024
const isImage = (name: string) => /\.(jpe?g|png)$/i.test(name)

/** A supplier's catalogue/price-list documents — separate from the
 *  structured materials below: the originals themselves (as the supplier
 *  sent them), not data entered from reading them. Not every supplier has
 *  a clean PDF — an embroidery supplier, say, may only have photos of its
 *  materials — so a plain photo is accepted too. Upload always adds a new
 *  one rather than replacing — a supplier can have a catalogue and a
 *  separate price list, or several years' editions. */
function DocumentList({ supplier }: { supplier: Supplier }) {
  const { data: docs = [], isLoading } = supplierDocumentHooks.useBySupplier(supplier.id)
  const upload = supplierDocumentHooks.useUpload()
  const del = supplierDocumentHooks.useDelete()
  const [confirmDelete, setConfirmDelete] = useState<SupplierDocument | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dateLocale = useDateLocale()

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error('File too large (max 20MB)')
      return
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      toast.error('Unsupported file type — use PDF, JPG, or PNG')
      return
    }
    upload.mutate({ supplierId: supplier.id, file })
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5 dark:text-slate-500">
        <FileText size={11} /> Catalogue &amp; price-list documents
      </p>
      {isLoading ? (
        <p className="text-xs text-slate-400 italic dark:text-navy-600">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-400 italic dark:text-navy-600">No documents yet.</p>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded px-2.5 py-1.5 dark:bg-navy-950">
              {isImage(d.file_name) ? (
                <img src={d.file_path} alt="" className="w-7 h-7 rounded object-cover shrink-0 border border-slate-200 dark:border-navy-800" />
              ) : (
                <FileText size={14} className="text-slate-400 shrink-0" />
              )}
              <a
                href={d.file_path} target="_blank" rel="noopener noreferrer" download={d.file_name}
                className="flex-1 truncate text-navy-700 hover:underline dark:text-slate-200" title={d.file_name}
              >
                {d.file_name}
              </a>
              <span className="text-xs text-slate-400 shrink-0 dark:text-navy-600">
                {format(new Date(d.uploaded_at), 'd MMM yyyy', { locale: dateLocale })}
              </span>
              <button onClick={() => setConfirmDelete(d)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title="Delete document">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={onPick} />
      <button className="btn-secondary btn-sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
        <Upload size={14} /> {upload.isPending ? 'Uploading…' : 'Upload PDF or photo'}
      </button>
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.file_name}"?`}
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

  const addColor = () => {
    if (!newCode.trim()) return
    create.mutate(
      { supplier_material_id: material.id, code: newCode.trim().toUpperCase(), category: null, hex: newHex },
      { onSuccess: () => setNewCode('') },
    )
  }

  return (
    <div className="pl-6 pr-2 pb-2 space-y-1.5">
      {colors.length === 0 && <p className="text-xs text-slate-400 italic dark:text-navy-600">No colours yet.</p>}
      {colors.map(c => (
        <div key={c.id} className="grid grid-cols-[1.5rem_5rem_1fr_1fr_1.5rem] gap-2 items-center text-sm">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888'}
            onChange={e => update.mutate({ id: c.id, body: { hex: e.target.value } })}
            className="w-6 h-6 rounded-full border-0 p-0 cursor-pointer"
            title="Pick a colour"
          />
          <EditableCell
            value={c.code} uppercase placeholder="Code"
            onSave={v => update.mutate({ id: c.id, body: { code: String(v) } })}
          />
          <EditableCell
            value={c.category ?? ''} uppercase placeholder="Category (optional)"
            onSave={v => update.mutate({ id: c.id, body: { category: String(v) || null } })}
          />
          <EditableCell
            value={c.hex} placeholder="#rrggbb"
            onSave={v => update.mutate({ id: c.id, body: { hex: String(v) } })}
          />
          <button onClick={() => setConfirmDelete(c)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title="Delete colour">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[1.5rem_5rem_1fr_1fr_1.5rem] gap-2 items-center pt-1">
        <input type="color" value={newHex} onChange={e => setNewHex(e.target.value)} className="w-6 h-6 rounded-full border-0 p-0 cursor-pointer" />
        <UppercaseField className="field !py-1 !text-xs" placeholder="Code" value={newCode} onChange={setNewCode} onKeyDown={e => e.key === 'Enter' && addColor()} />
        <span />
        <span />
        <button onClick={addColor} disabled={!newCode.trim() || create.isPending} className="text-navy-500 hover:text-navy-700 disabled:opacity-30 dark:text-navy-400" title="Add colour">
          <Plus size={14} />
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete colour "${confirmDelete.code}"?`}
          onConfirm={() => { del.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
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

  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-navy-800">
      <div className="grid grid-cols-[1.25rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_1.5rem] gap-2 items-center px-1 py-1.5">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500" aria-label={open ? 'Collapse' : 'Expand'}>
          <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <EditableCell value={material.name} uppercase placeholder="Material name" onSave={v => save({ name: String(v) })} />
        <EditableCell value={material.brand ?? ''} uppercase placeholder="Brand" onSave={v => save({ brand: String(v) || null })} />
        <EditableCell
          type="number" value={material.price} placeholder="Price"
          format={v => <span className="font-mono tabular-nums">{formatRp(Number(v))}</span>}
          onSave={v => save({ price: Number(v) || 0 })}
        />
        <button onClick={() => setConfirmDelete(true)} className="text-slate-300 hover:text-red-500 dark:text-navy-700" title="Delete material">
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="pb-2">
          <div className="pl-6 pr-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Composition
              <EditableCell value={material.composition ?? ''} uppercase placeholder="e.g. 65% polyester, 35% rayon" onSave={v => save({ composition: String(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Used for
              <EditableCell value={material.used_for ?? ''} uppercase placeholder="e.g. uniforms, bags" onSave={v => save({ used_for: String(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Width (cm)
              {/* EditableCell already coerces a number cell's value before
                 calling onSave, so an emptied field arrives here as 0, not
                 '' — `|| null` turns that back into "no width recorded"
                 rather than saving a literal 0. */}
              <EditableCell type="number" value={material.width_cm ?? ''} placeholder="—" onSave={v => save({ width_cm: Number(v) || null })} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Roll (yd)
              <EditableCell type="number" value={material.roll_yards ?? ''} placeholder="—" onSave={v => save({ roll_yards: Number(v) || null })} />
            </label>
          </div>
          <p className="pl-6 pr-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1.5 dark:text-slate-500">
            <Palette size={11} /> Colours
          </p>
          <ColorList material={material} />
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${material.name}" and all its colours? This can't be undone.`}
          onConfirm={() => { del.mutate(material.id); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
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

  const addMaterial = () => {
    if (!newName.trim()) return
    create.mutate(
      { supplier_id: supplier.id, name: newName.trim().toUpperCase(), brand: newBrand.trim() || null, composition: null, used_for: null, width_cm: null, roll_yards: null, price: 0 },
      { onSuccess: () => { setNewName(''); setNewBrand('') } },
    )
  }

  return (
    <Modal title={`${supplier.supplier_name} — Catalogue`} onClose={onClose} size="xl">
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Materials, colours and the current price for this supplier — picked up automatically by the Kas Bon colour picker and the Ledger's own swatch.
        </p>
        <DocumentList supplier={supplier} />
        <hr className="border-slate-100 dark:border-navy-800" />
        <div className="flex items-end gap-2 bg-slate-50 rounded-lg p-2.5 dark:bg-navy-950">
          <label className="flex-1">
            <span className="field-label">New material</span>
            <UppercaseField className="field !py-1.5" placeholder="e.g. CP AMERICAN DRILL" value={newName} onChange={setNewName} onKeyDown={e => e.key === 'Enter' && addMaterial()} />
          </label>
          <label className="w-40">
            <span className="field-label">Brand (optional)</span>
            <UppercaseField className="field !py-1.5" placeholder="e.g. VERLANDO" value={newBrand} onChange={setNewBrand} onKeyDown={e => e.key === 'Enter' && addMaterial()} />
          </label>
          <button className="btn-primary btn-sm" disabled={!newName.trim() || create.isPending} onClick={addMaterial}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="border border-slate-100 rounded-lg max-h-[50vh] overflow-y-auto dark:border-navy-800">
          {isLoading ? (
            <p className="p-4 text-sm text-slate-400 text-center">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="p-6 text-sm text-slate-400 text-center">No materials yet — add the first one above.</p>
          ) : (
            materials.map(m => <MaterialRow key={m.id} material={m} />)
          )}
        </div>
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}
