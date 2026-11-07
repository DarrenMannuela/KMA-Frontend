import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Trans, useTranslation } from 'react-i18next'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatRp } from '@/components/ui'
import { financeBatchApi, suppliersApi } from '@/api'
import { recordBatches, productionHooks, operationHooks } from '@/hooks'
import { parseDelimited, cellText, type Grid } from '@/utils/tableText'
import { readXlsx } from '@/utils/xlsx'
import { todayISODate } from '@/utils/MonthUtils'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import { CATEGORY_LABELS } from '@/constants/supplierCategories'
import { friendlyError } from '@/utils/friendlyError'
import type { FinanceBatch, FinanceBatchResult, FinanceHeader, Order, Supplier, SupplierCategory } from '@/types'
import { guessColumns, readRows, TARGETS, targetLabel, type Guess, type ImportedRow, type Target } from './columnGuess'
import { supplierWithCategory, type Kind } from './ledgerModel'

const CHUNK = 1500 // lines per request, under the server's 2000

type Grouping = 'single' | 'perDate'
// What to do with a supplier name that isn't in the supplier list.
type SupplierChoice = { mode: 'existing'; id: number } | { mode: 'create'; category: SupplierCategory }

interface Planned extends ImportedRow {
  headerId: string
  problem: string | null
  note: string | null
}

export function ImportDialog({ kind, headers, suppliers, orders, initialGrid, onClose }: {
  kind: Kind
  headers: FinanceHeader[]
  suppliers: Supplier[]
  orders: Order[]
  initialGrid?: Grid
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [grid, setGrid] = useState<Grid | null>(initialGrid ?? null)
  const [fileName, setFileName] = useState('')
  const [pasted, setPasted] = useState('')
  const [guess, setGuess] = useState<Guess | null>(() => (initialGrid ? guessColumns(initialGrid, kind, suppliers) : null))
  const [grouping, setGrouping] = useState<Grouping>('single')
  const [single, setSingle] = useState({ id: suggestNextKasBonId(headers), date: todayISODate(), description: '' })
  const [supplierChoices, setSupplierChoices] = useState<Record<string, SupplierChoice>>({})
  const [busy, setBusy] = useState(false)
  const production = productionHooks.useList()
  const operations = operationHooks.useList()
  // Lines already saved, so importing the same file twice adds nothing.
  const saved = useMemo(() => new Set(kind === 'production'
    ? production.data.map(r => `${r.header_id}|${r.material_name}|${r.price}|${r.amount}`)
    : operations.data.map(r => `${r.header_id}|${r.category}|${r.item_description}|${r.price}`)), [kind, production.data, operations.data])

  const load = (g: Grid, name = '') => {
    if (!g.length) return toast.error(t('financeImport.noRows'))
    setGrid(g)
    setFileName(name)
    setGuess(guessColumns(g, kind, suppliers))
  }

  const onFile = async (file: File) => {
    try {
      if (/\.xlsx$/i.test(file.name)) load(await readXlsx(await file.arrayBuffer()), file.name)
      else if (/\.xls$/i.test(file.name)) toast.error(t('financeImport.oldXls'))
      else load(parseDelimited(await file.text()), file.name)
    } catch (e) {
      toast.error(t('financeImport.couldntRead', { name: file.name, message: (e as Error).message }))
    }
  }

  const rows = useMemo(() => (grid && guess ? readRows(grid, guess, suppliers) : []), [grid, guess, suppliers])
  const hasIdColumn = guess?.targets.includes('header_id') ?? false

  // Supplier names in the file that don't match a supplier.
  const unknownSuppliers = useMemo(() => {
    if (kind !== 'production') return []
    return [...new Set(rows.filter(r => r.supplierText && !r.supplier_id).map(r => r.supplierText))]
  }, [rows, kind])
  const noSupplierRows = kind === 'production' && rows.some(r => !r.supplierText)
  const choiceFor = (name: string): SupplierChoice => supplierChoices[name] ?? { mode: 'create', category: 'general_supplier' }
  const [fallbackSupplier, setFallbackSupplier] = useState<number>(suppliers[0]?.id ?? 0)

  const plan: Planned[] = useMemo(() => {
    const known = new Set(headers.map(h => h.id))
    const orderIds = new Set(orders.map(o => o.id))
    // One new Kas Bon per date, numbered on from the last one of each year.
    const perDateIds = new Map<string, string>()
    const taken = [...headers]
    const idForDate = (date: string) => {
      if (!perDateIds.has(date)) {
        const id = suggestNextKasBonId(taken, Number(date.slice(0, 4)))
        taken.push({ id, date, description: '' })
        perDateIds.set(date, id)
      }
      return perDateIds.get(date)!
    }
    return rows.map(r => {
      let headerId = r.header_id
      let problem: string | null = null
      let note: string | null = null
      if (!headerId) {
        if (hasIdColumn) problem = t('financeImport.noKasBonId')
        else if (grouping === 'single') headerId = single.id.trim().toUpperCase()
        else if (r.date) headerId = idForDate(r.date)
        else problem = t('financeImport.noDate')
      }
      if (kind === 'production') {
        if (!r.name) problem ??= t('financeImport.bahanMissing')
        if (!(r.qty != null && r.qty > 0)) problem ??= t('financeImport.qtyMissing')
      } else if (!r.category && !r.name) {
        problem ??= t('financeImport.categoryMissing')
      }
      if (r.price == null) problem ??= t('financeImport.priceMissing')
      const key = kind === 'production' ? `${headerId}|${r.name}|${r.price}|${r.qty}` : `${headerId}|${r.category || r.name}|${r.name || r.category}|${r.price}`
      if (headerId && saved.has(key)) problem ??= t('financeImport.alreadySaved')
      if (r.order && !orderIds.has(r.order)) note = t('financeImport.noOrderUnlinked', { id: r.order })
      if (headerId && known.has(headerId)) note ??= t('financeImport.addedToExisting', { id: headerId })
      return { ...r, headerId, problem, note }
    })
  }, [rows, headers, orders, grouping, single.id, kind, hasIdColumn, saved, t])

  const good = plan.filter(p => !p.problem)
  const newHeaderIds = [...new Set(good.map(p => p.headerId))].filter(id => !headers.some(h => h.id === id))
  const missingDates = newHeaderIds.filter(id =>
    !hasIdColumn && grouping === 'single' ? !single.date : !good.some(p => p.headerId === id && p.date))
  const total = good.reduce((n, p) => n + Math.round((p.price ?? 0) * (kind === 'production' ? p.qty ?? 0 : 1)), 0)

  const runImport = async () => {
    if (!good.length || missingDates.length) return
    setBusy(true)
    const results: FinanceBatchResult[] = []
    try {
      // New suppliers first, so their lines can point at them.
      const supplierIdFor = new Map<string, number>()
      for (const name of unknownSuppliers) {
        const c = choiceFor(name)
        if (c.mode === 'existing') supplierIdFor.set(name, c.id)
        else {
          const created = await suppliersApi.create({ supplier_name: name.toUpperCase(), supplier_category: c.category })
          supplierIdFor.set(name, created.id)
        }
      }
      if (unknownSuppliers.some(n => choiceFor(n).mode === 'create')) qc.invalidateQueries({ queryKey: ['suppliers'] })

      const headerInfo = (id: string): FinanceHeader => {
        if (!hasIdColumn && grouping === 'single') return { id, date: single.date, description: single.description.toUpperCase() || 'IMPORT' }
        const lines = good.filter(p => p.headerId === id)
        return { id, date: lines.find(p => p.date)?.date ?? todayISODate(), description: lines.find(p => p.description)?.description || 'IMPORT' }
      }
      const orderIds = new Set(orders.map(o => o.id))
      const byHeader = new Map<string, Planned[]>()
      good.forEach(p => byHeader.set(p.headerId, [...(byHeader.get(p.headerId) ?? []), p]))

      const batches: FinanceBatch[] = []
      let current: FinanceBatch = { headers: [], production_create: [], operation_create: [] }
      let size = 0
      for (const [id, lines] of byHeader) {
        if (size + lines.length > CHUNK && size > 0) {
          batches.push(current)
          current = { headers: [], production_create: [], operation_create: [] }
          size = 0
        }
        if (newHeaderIds.includes(id)) current.headers!.push(headerInfo(id))
        for (const p of lines) {
          const order_id = p.order && orderIds.has(p.order) ? p.order : null
          if (kind === 'production') {
            const supplier_id = p.supplier_id || (p.supplierText ? supplierIdFor.get(p.supplierText) : fallbackSupplier) || fallbackSupplier
            current.production_create!.push({ header_id: id, material_name: p.name, supplier_id, amount: p.qty ?? 1, si_unit: p.unit, price: p.price ?? 0, order_id })
          } else {
            current.operation_create!.push({ header_id: id, category: p.category || p.name, description: p.name || p.category, price: p.price ?? 0, order_id })
          }
        }
        size += lines.length
      }
      if (size) batches.push(current)

      for (const b of batches) results.push(await financeBatchApi.apply(b))
      onClose()
    } catch (e) {
      toast.error(t(results.length ? 'financeImport.importStoppedPartial' : 'financeImport.importStopped', { error: friendlyError(e) }))
    } finally {
      if (results.length) recordBatches(qc, t('financeImport.imported', { count: good.length }), results)
      setBusy(false)
    }
  }

  return (
    <Modal title={kind === 'production' ? t('financeImport.titleProduction') : t('financeImport.titleOperation')} onClose={onClose} size="xl">
      {!grid || !guess ? (
        <div className="space-y-4">
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-8 text-center cursor-pointer hover:border-navy-300 hover:bg-navy-50/30 dark:border-navy-700"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          >
            <Upload className="text-slate-300 dark:text-navy-700" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('financeImport.dropHint')}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('financeImport.headingsHint')}</span>
            <input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          </label>
          <div>
            <span className="field-label">{t('financeImport.orPaste')}</span>
            <textarea className="field font-mono text-xs h-28" value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Tanggal\tBahan\tSupplier\tQty\tSatuan\tHarga'} />
            <div className="flex justify-end mt-2">
              <button className="btn-primary btn-sm" disabled={!pasted.trim()} onClick={() => load(parseDelimited(pasted))}>{t('financeImport.readRows')}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <FileSpreadsheet size={16} className="text-navy-500" />
            <span className="font-medium">{fileName || t('financeImport.pastedRows')}</span>
            <span className="text-slate-500 dark:text-slate-400">{t('financeImport.rowCount', { n: grid.length })}</span>
            <button className="ml-auto text-xs text-navy-600 hover:underline dark:text-navy-300" onClick={() => { setGrid(null); setGuess(null) }}>{t('financeImport.chooseAnother')}</button>
          </div>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 dark:text-slate-400">{t('financeImport.step1')}</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-navy-800">
              <table className="text-xs min-w-full">
                <tbody>
                  <tr className="bg-slate-50 dark:bg-navy-950">
                    {guess.targets.map((t, i) => (
                      <td key={i} className="p-1.5 min-w-[8rem]">
                        <select
                          className={`field !py-1 text-xs ${t === 'ignore' ? 'text-slate-500 dark:text-slate-400' : 'font-medium'}`}
                          value={t}
                          onChange={e => setGuess(g => g && ({ ...g, targets: g.targets.map((x, j) => (j === i ? e.target.value as Target : x === e.target.value && x !== 'ignore' ? 'ignore' : x)) }))}
                        >
                          {TARGETS[kind].map(o => <option key={o} value={o}>{targetLabel(kind, o)}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                  {grid.slice(0, 4).map((r, ri) => (
                    <tr key={ri} className={ri === 0 && guess.hasHeadings ? 'text-slate-500 italic dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'}>
                      {guess.targets.map((_, i) => <td key={i} className="px-2.5 py-1 truncate max-w-[12rem]">{cellText(r[i])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={guess.hasHeadings} onChange={e => setGuess(g => g && ({ ...g, hasHeadings: e.target.checked }))} />
              {t('financeImport.firstRowHeadings')}
            </label>
          </section>

          {!hasIdColumn && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('financeImport.step2')}</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2"><input type="radio" checked={grouping === 'single'} onChange={() => setGrouping('single')} /> {t('financeImport.allOnOne')}</label>
                <label className="inline-flex items-center gap-2"><input type="radio" checked={grouping === 'perDate'} onChange={() => setGrouping('perDate')} disabled={!guess.targets.includes('date')} /> {t('financeImport.newPerDate')}</label>
              </div>
              {grouping === 'single' && (
                <div className="grid grid-cols-1 sm:grid-cols-[9rem_10rem_1fr] gap-2">
                  <input className="field font-mono" value={single.id} onChange={e => setSingle(s => ({ ...s, id: e.target.value.toUpperCase() }))} />
                  <input type="date" className="field" value={single.date} onChange={e => setSingle(s => ({ ...s, date: e.target.value }))} />
                  <input className="field" placeholder={t('ledger.columns.description')} value={single.description} onChange={e => setSingle(s => ({ ...s, description: e.target.value.toUpperCase() }))} />
                </div>
              )}
            </section>
          )}

          {kind === 'production' && (unknownSuppliers.length > 0 || noSupplierRows) && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('financeImport.suppliers')}</h4>
              {unknownSuppliers.map(name => {
                const c = choiceFor(name)
                return (
                  <div key={name} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-700 min-w-[10rem] dark:text-slate-300">{name}</span>
                    <select
                      className="field !w-auto !py-1 text-xs"
                      value={c.mode === 'existing' ? String(c.id) : `new:${c.category}`}
                      onChange={e => {
                        const v = e.target.value
                        setSupplierChoices(s => ({ ...s, [name]: v.startsWith('new:') ? { mode: 'create', category: v.slice(4) as SupplierCategory } : { mode: 'existing', id: Number(v) } }))
                      }}
                    >
                      <optgroup label={t('financeImport.addAsNew')}>
                        {(Object.keys(CATEGORY_LABELS) as SupplierCategory[]).map(cat => <option key={cat} value={`new:${cat}`}>{t('financeImport.newCategory', { category: CATEGORY_LABELS[cat] })}</option>)}
                      </optgroup>
                      <optgroup label={t('financeImport.existingSupplier')}>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
                      </optgroup>
                    </select>
                  </div>
                )
              })}
              {noSupplierRows && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-600 min-w-[10rem] dark:text-slate-300">{t('financeImport.linesNoSupplier')}</span>
                  <select className="field !w-auto !py-1 text-xs" value={fallbackSupplier} onChange={e => setFallbackSupplier(Number(e.target.value))}>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{supplierWithCategory(s)}</option>)}
                  </select>
                </div>
              )}
            </section>
          )}

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 dark:text-slate-400">{t('financeImport.preview')}</h4>
            <div className="max-h-56 overflow-auto rounded-lg border border-slate-100 dark:border-navy-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 dark:bg-navy-950 dark:text-slate-400">
                  <tr>
                    <th className="text-left px-2 py-1.5">{t('ledger.columns.kasBon')}</th>
                    <th className="text-left px-2 py-1.5">{t('common.date')}</th>
                    <th className="text-left px-2 py-1.5">{kind === 'production' ? t('ledger.columns.bahan') : t('financeImport.categoryItem')}</th>
                    {kind === 'production' && <th className="text-left px-2 py-1.5">{t('ledger.columns.supplier')}</th>}
                    {kind === 'production' && <th className="text-right px-2 py-1.5">{t('ledger.columns.qty')}</th>}
                    <th className="text-right px-2 py-1.5">{t('ledger.columns.price')}</th>
                    <th className="text-left px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {plan.slice(0, 200).map((p, i) => (
                    <tr key={i} className={`border-t border-slate-50 dark:border-navy-800 ${p.problem ? 'bg-red-50/60 text-red-700 dark:bg-red-500/10 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      <td className="px-2 py-1 font-mono">{p.headerId || '—'}</td>
                      <td className="px-2 py-1">{p.date ?? (grouping === 'single' && !hasIdColumn ? single.date : '—')}</td>
                      <td className="px-2 py-1">{kind === 'production' ? p.name : [p.category, p.name].filter(Boolean).join(' · ')}</td>
                      {kind === 'production' && <td className="px-2 py-1">{p.supplierText || '—'}</td>}
                      {kind === 'production' && <td className="px-2 py-1 text-right">{p.qty ?? '—'} {p.unit}</td>}
                      <td className="px-2 py-1 text-right font-mono">{p.price != null ? formatRp(p.price) : '—'}</td>
                      <td className="px-2 py-1 text-[11px]">{p.problem ?? <span className="text-slate-500 dark:text-slate-400">{p.note}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <Trans
                i18nKey="financeImport.summary"
                count={good.length}
                values={{ kasBon: new Set(good.map(p => p.headerId)).size, newCount: newHeaderIds.length, amount: formatRp(total) }}
                components={{ b: <span className="font-semibold text-navy-900 dark:text-slate-50" />, m: <span className="font-mono" /> }}
              />
              {plan.length > good.length && <span className="text-red-600 dark:text-red-400"> · {t('financeImport.skipped', { n: plan.length - good.length })}</span>}
            </p>
            {missingDates.length > 0 && <p className="text-xs text-red-600 dark:text-red-400">{t('financeImport.noDateForNew', { ids: missingDates.slice(0, 3).join(', ') })}</p>}
            <span className="flex-1" />
            <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={busy || !good.length || missingDates.length > 0} onClick={runImport}>
              {busy ? t('financeImport.importing') : t('financeImport.importLines', { count: good.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
