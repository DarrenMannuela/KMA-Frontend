import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Factory, Wrench } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatRp } from '@/components/ui'
import { useFinanceBatch } from '@/hooks'
import { useIsDirty, useUnsavedChanges, useAutosaveDraft, loadDraft, clearDraft } from '@/hooks/useUnsavedChanges'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/api'
import { SI_UNITS } from '@/utils/Units'
import { todayISODate } from '@/utils/MonthUtils'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import { parseDelimited } from '@/utils/tableText'
import { ALL_CATALOGUES, catalogueForSupplier, materialFromText, materialLabel, colorCodeFromText } from '@/data/materialCatalogue'
import type { FinanceBatch, FinanceHeader, Order, Supplier } from '@/types'
import { draftProblem, draftsToBatch, draftTotal, newDraft, supplierWithCategory, type DraftLine, type Kind } from './ledgerModel'
import { guessColumns, readRows } from './columnGuess'
import { MaterialColorPicker } from './MaterialColorPicker'

interface KasBonFormProps {
  kind: Kind
  headers: FinanceHeader[]
  suppliers: Supplier[]
  orders: Order[]
  categories: string[]
  /** Adds lines to this existing Kas Bon instead of starting a new one. */
  headerId?: string
  lines?: DraftLine[]
  defaultSupplierId?: number
  onClose: () => void
}

const isBlank = (d: DraftLine) => !d.name.trim() && !d.category.trim() && !d.price.trim()

/** A Kas Bon with all its lines, entered in one go. */
export function KasBonForm({ kind, headers, suppliers, orders, categories, headerId: existingId, lines: initialLines, defaultSupplierId, onClose }: KasBonFormProps) {
  const existing = existingId ? headers.find(h => h.id === existingId) : undefined
  const defaults = (k: Kind): Partial<DraftLine> => (k === 'production' ? { supplier_id: defaultSupplierId ?? suppliers[0]?.id ?? 0 } : {})
  const [date, setDate] = useState(existing?.date?.slice(0, 10) ?? todayISODate())
  const [id, setId] = useState(existing?.id ?? suggestNextKasBonId(headers))
  const [idTouched, setIdTouched] = useState(!!existing)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialLines?.length ? initialLines.map(l => ({ ...defaults(l.kind), ...l })) : [newDraft(kind, defaults(kind))])
  const [showErrors, setShowErrors] = useState(false)
  const save = useFinanceBatch()
  const formRef = useRef<HTMLDivElement>(null)

  // Autosaved locally so a crashed tab or closed browser doesn't take a half-
  // typed Kas Bon with it — only for a brand-new one; adding lines to an
  // existing Kas Bon isn't drafted (there's a real record to just reopen).
  type Draft = { date: string; id: string; description: string; lines: DraftLine[] }
  const { user } = useAuth()
  // Scoped to the signed-in account so a shared browser never offers one
  // account's unsubmitted draft to a different account that signs in later.
  const draftKey = `kasbon.${user?.id ?? 'anon'}.${kind}.new`
  const restoredRef = useRef(false)
  useEffect(() => {
    if (existing || restoredRef.current) return
    restoredRef.current = true
    const draft = loadDraft<Draft>(draftKey)
    if (!draft || (!draft.description.trim() && !draft.lines.some(l => !isBlank(l)))) return
    if (window.confirm('Restore the Kas Bon you were entering before?')) {
      setDate(draft.date)
      setId(draft.id)
      setIdTouched(true)
      setDescription(draft.description)
      setLines(draft.lines)
    } else {
      clearDraft(draftKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useAutosaveDraft(draftKey, { date, id, description, lines }, !!existing)

  const isDirty = useIsDirty({ date, id, description, lines })
  const { guardClose } = useUnsavedChanges(isDirty, () => clearDraft(draftKey))
  const close = () => guardClose(onClose)

  const supplierIds = useMemo(() => new Set(suppliers.map(s => s.id)), [suppliers])
  const target = headers.find(h => h.id === id.trim())
  const filled = lines.filter(l => !isBlank(l))
  const problems = filled.map(l => draftProblem(l, supplierIds))
  const total = filled.reduce((n, l) => n + draftTotal(l), 0)

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
  const addLine = (k: Kind = kind) => setLines(ls => [...ls, newDraft(k, defaults(k))])
  const removeLine = (key: string) => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : [newDraft(kind, defaults(kind))]))

  // The date's year picks the ID's "/YY", until the ID is typed by hand.
  const changeDate = (value: string) => {
    setDate(value)
    if (!idTouched && value) setId(suggestNextKasBonId(headers, Number(value.slice(0, 4))))
  }

  const focusLine = (index: number) => {
    requestAnimationFrame(() => {
      formRef.current?.querySelectorAll<HTMLElement>('[data-line-first]')[index]?.focus()
    })
  }

  const onLineKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    if (e.metaKey || e.ctrlKey) return // Ctrl+Enter saves
    e.preventDefault()
    if (index === lines.length - 1) addLine(lines[index].kind)
    focusLine(index + 1)
  }

  // A block pasted from Excel fills this line and the ones after it.
  const onLinePaste = (e: React.ClipboardEvent, index: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(text.trim())) return
    e.preventDefault()
    const grid = parseDelimited(text, text.includes('\t') ? '\t' : undefined)
    const k = lines[index].kind
    const rows = readRows(grid, guessColumns(grid, k, suppliers), suppliers)
    const drafts = rows.map(r => newDraft(k, {
      ...defaults(k), name: r.name, category: r.category, unit: r.unit,
      qty: r.qty != null ? String(r.qty) : '1', price: r.price != null ? String(r.price) : '',
      ...(r.supplier_id ? { supplier_id: r.supplier_id } : {}),
      order_id: orders.some(o => o.id === r.order) ? r.order : '',
    }))
    if (!drafts.length) return
    setLines(ls => [...ls.slice(0, index), ...drafts, ...ls.slice(index + (isBlank(ls[index]) ? 1 : 0))])
  }

  const submit = () => {
    setShowErrors(true)
    const headerId = id.trim().toUpperCase()
    if (!headerId || !date) return
    if (!filled.length || problems.some(Boolean)) return
    const desc = description.trim().toUpperCase() ||
      (filled[0].kind === 'production' ? filled[0].name : filled[0].category).trim().toUpperCase()
    let batch: FinanceBatch
    if (target) {
      batch = { headers: [target] }
      // Only a Kas Bon opened for editing has its date and description changed;
      // typing an existing ID just adds lines to it.
      if (existing && (target.date.slice(0, 10) !== date || target.description !== desc)) {
        batch.header_update = [{ id: target.id, date, description: desc }]
      }
    } else {
      batch = { new_headers: [{ id: headerId, date, description: desc }] }
    }
    save.mutate({
      batch: draftsToBatch(filled, target?.id ?? headerId, batch),
      label: `Saved ${filled.length} line${filled.length === 1 ? '' : 's'} on ${target?.id ?? headerId}`,
    }, {
      onSuccess: () => { clearDraft(draftKey); onClose() },
      onError: e => {
        // Someone else just took this number: offer the next one.
        if (e instanceof ApiError && e.status === 409) setId(headerId.replace(/^\d+/, n => String(Number(n) + 1).padStart(n.length, '0')))
      },
    })
  }

  const title = existing ? `Add lines to ${existing.id}` : 'New Kas Bon'
  const orderListId = 'kasbon-orders'
  const categoryListId = 'kasbon-categories'

  return (
    <Modal title={title} onClose={close} size="xl">
      <div
        ref={formRef}
        className="space-y-4"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-[10rem_10rem_1fr] gap-3">
          <label className="block">
            <span className="field-label">Kas Bon ID</span>
            <input
              className={`field font-mono ${showErrors && !id.trim() ? 'border-red-300' : ''}`}
              value={id}
              disabled={!!existing}
              onChange={e => { setId(e.target.value.toUpperCase()); setIdTouched(true) }}
              list="kasbon-ids"
            />
            <datalist id="kasbon-ids">{headers.slice(-200).map(h => <option key={h.id} value={h.id} />)}</datalist>
            {!existing && target && <span className="text-[11px] text-amber-600 dark:text-amber-400">Exists: lines will be added to it</span>}
          </label>
          <label className="block">
            <span className="field-label">Date</span>
            <input type="date" className="field" value={date} onChange={e => changeDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Description</span>
            <input
              className="field"
              value={description}
              placeholder={kind === 'production' ? 'e.g. BELI BAHAN DRILL' : 'e.g. BIAYA BULANAN'}
              onChange={e => setDescription(e.target.value.toUpperCase())}
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-100 overflow-hidden dark:border-navy-800">
          <div className="hidden md:grid grid-cols-[1.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_4.5rem_5.5rem_7rem_7rem_minmax(0,1fr)_2rem] gap-2 px-3 py-2 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-navy-950 dark:text-slate-400">
            <span />
            <span>Bahan / item</span>
            <span>Supplier / category</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
            <span>Order</span>
            <span />
          </div>
          <div className="divide-y divide-slate-100 max-h-[45vh] overflow-y-auto dark:divide-navy-800">
            {lines.map((l, i) => {
              const problem = showErrors && !isBlank(l) ? draftProblem(l, supplierIds) : null
              const keys = { onKeyDown: (e: React.KeyboardEvent) => onLineKey(e, i), onPaste: (e: React.ClipboardEvent) => onLinePaste(e, i) }
              const prod = l.kind === 'production'
              const supplierName = prod ? suppliers.find(s => s.id === l.supplier_id)?.supplier_name : undefined
              const catalogue = prod ? catalogueForSupplier(supplierName) : undefined
              const catMatch = catalogue ? materialFromText(catalogue, l.name) : undefined
              const catCode = catalogue && catMatch ? colorCodeFromText(catMatch, l.name) : undefined
              const catColors = catalogue && catMatch ? catalogue.colorsFor(catMatch) : []
              return (
                <div key={l.key} className={`px-3 py-2 ${problem ? 'bg-red-50/50 dark:bg-red-500/10' : ''}`}>
                  <div className="grid grid-cols-2 md:grid-cols-[1.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_4.5rem_5.5rem_7rem_7rem_minmax(0,1fr)_2rem] gap-2 items-center">
                    <span className="hidden md:flex text-slate-300 dark:text-navy-700" title={prod ? 'Production line' : 'Operation cost'}>
                      {prod ? <Factory size={14} /> : <Wrench size={14} />}
                    </span>
                    <input
                      data-line-first
                      className="field col-span-2 md:col-span-1 !py-1.5"
                      placeholder={catalogue ? 'Bahan — pick from catalogue or type' : prod ? 'Bahan, e.g. DRILL 902' : 'Item, e.g. OJEK AMBIL BAHAN'}
                      value={l.name}
                      list={catalogue ? `material-catalogue-${catalogue.id}` : undefined}
                      onChange={e => {
                        const name = e.target.value.toUpperCase()
                        const picked = catalogue ? materialFromText(catalogue, name) : undefined
                        setLine(l.key, picked ? { name, unit: 'yard' } : { name })
                      }}
                      {...keys}
                    />
                    {prod ? (
                      <select
                        className="field col-span-2 md:col-span-1 !py-1.5"
                        value={l.supplier_id || ''}
                        onChange={e => setLine(l.key, { supplier_id: Number(e.target.value) })}
                        {...keys}
                      >
                        <option value="">Supplier…</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
                      </select>
                    ) : (
                      <input
                        className="field col-span-2 md:col-span-1 !py-1.5"
                        placeholder="Category, e.g. TRANSPORT"
                        list={categoryListId}
                        value={l.category}
                        onChange={e => setLine(l.key, { category: e.target.value.toUpperCase() })}
                        {...keys}
                      />
                    )}
                    {prod ? (
                      <>
                        <input
                          className="field !py-1.5 text-right"
                          inputMode="decimal"
                          aria-label="Qty"
                          value={l.qty}
                          onChange={e => setLine(l.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })}
                          {...keys}
                        />
                        <select className="field !py-1.5" aria-label="Unit" value={l.unit} onChange={e => setLine(l.key, { unit: e.target.value })} {...keys}>
                          {[...new Set([...SI_UNITS, l.unit])].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </>
                    ) : (
                      <span className="hidden md:block md:col-span-2" />
                    )}
                    <input
                      className="field !py-1.5 text-right font-mono"
                      inputMode="numeric"
                      placeholder="Price"
                      value={l.price ? Number(l.price).toLocaleString('id-ID') : ''}
                      onChange={e => setLine(l.key, { price: e.target.value.replace(/\D/g, '') })}
                      {...keys}
                    />
                    <span className="text-right font-mono text-sm text-slate-700 tabular-nums dark:text-slate-300">{formatRp(draftTotal(l))}</span>
                    <input
                      className="field !py-1.5 font-mono text-xs"
                      placeholder="Order (optional)"
                      list={orderListId}
                      value={l.order_id}
                      onChange={e => setLine(l.key, { order_id: e.target.value.toUpperCase() })}
                      {...keys}
                    />
                    <button type="button" onClick={() => removeLine(l.key)} className="justify-self-end p-1 text-slate-300 hover:text-red-500 dark:text-navy-700" title="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {problem && <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{problem}</p>}
                  {!problem && catalogue && catMatch && (
                    <>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {catMatch.composition}
                        {catMatch.widthCm != null && catMatch.rollYards != null && <> · roll {catMatch.widthCm} cm × {catMatch.rollYards} yd</>}
                      </p>
                      {catColors.length > 0 ? (
                        <MaterialColorPicker
                          material={catMatch}
                          colors={catColors}
                          selectedCode={catCode}
                          onPick={code => setLine(l.key, { name: `${materialLabel(catMatch)} - ${code}`, unit: 'yard' })}
                        />
                      ) : (
                        // Not every catalogue entry has recorded colour
                        // codes yet (e.g. SAI's "Basic" and "Blue Jeans
                        // Series") — say so, rather than silently showing
                        // nothing where the picker usually sits, which
                        // reads as broken instead of "no data yet".
                        <p className="mt-1 text-[11px] text-slate-400 italic dark:text-navy-600">No colour list recorded for this fabric yet — type the colour/code after the name if you know it.</p>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-50/60 border-t border-slate-100 dark:bg-navy-950/60 dark:border-navy-800">
            <button type="button" onClick={() => { addLine(kind); focusLine(lines.length) }} className="btn-ghost btn-sm">
              <Plus size={13} /> {kind === 'production' ? 'Add bahan' : 'Add cost'}
            </button>
            <button type="button" onClick={() => { addLine(kind === 'production' ? 'operation' : 'production'); focusLine(lines.length) }} className="btn-ghost btn-sm">
              <Plus size={13} /> {kind === 'production' ? 'Add an operation cost (ojek, parkir…)' : 'Add a bahan line'}
            </button>
            <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              {filled.length} line{filled.length === 1 ? '' : 's'} · <span className="font-mono font-semibold text-navy-900 dark:text-slate-50">{formatRp(total)}</span>
            </span>
          </div>
        </div>
        <datalist id={orderListId}>
          {orders.slice(-300).reverse().map(o => <option key={o.id} value={o.id}>{o.company ?? ''}</option>)}
        </datalist>
        <datalist id={categoryListId}>{categories.map(c => <option key={c} value={c} />)}</datalist>
        {/* One per registered supplier catalogue — only lines whose supplier
            matches that catalogue actually attach to it (see `catalogue`
            above), so an unmatched one is simply inert. */}
        {ALL_CATALOGUES.map(c => (
          <datalist key={c.id} id={`material-catalogue-${c.id}`}>
            {c.materials.map(m => <option key={materialLabel(m)} value={materialLabel(m)} />)}
          </datalist>
        ))}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Enter moves to the next line · paste rows copied from Excel into any line · Ctrl+Enter saves
        </p>
        {showErrors && !filled.length && <p className="text-sm text-red-500 dark:text-red-400">Add at least one line.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : `Save ${filled.length || ''} line${filled.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

