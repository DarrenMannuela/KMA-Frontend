import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Loader2, ScanSearch } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { UppercaseField } from '@/components/ui'
import { supplierMaterialHooks, supplierMaterialColorHooks } from '@/hooks'
import { supplierMaterialApi, supplierMaterialColorApi } from '@/api'
import { friendlyError } from '@/utils/friendlyError'
import { corrected, hexOf, type RGB } from '@/utils/colour'
import { assignLabels, boxColour, codeSequence, consistentSize, detectSwatches, joinLabels, orderSwatches, paperColour, type TextLabel } from '@/utils/swatchDetect'
import type { Supplier, SupplierDocument } from '@/types'

// Reads the colours off a supplier's catalogue file (a PDF or a photo of a
// swatch card) instead of typing them in one by one. Each page is drawn,
// the swatches on it are found (utils/swatchDetect), corrected for the
// lighting of the scan or photo by the white of the paper, and numbered in
// reading order from a starting code. The person checks the result (a click
// on a swatch leaves it out, a click on an empty spot adds one there, any
// code can be changed) and adds them all to a material in one go.

interface Page { n: number; url: string; aspect: number; data: ImageData; paper: RGB; auto: boolean; labels: TextLabel[] }
interface Swatch { id: number; page: number; x: number; y: number; w: number; h: number; raw: RGB; on: boolean; printed: string | null; category: string | null; removed?: boolean }

const DISPLAY_W = 900
const DETECT_W = 640
const MIN_PER_PAGE = 3 // fewer than this on a page is a banner or photo, not a swatch card

async function renderPages(url: string, isPdf: boolean, onPage: (canvas: HTMLCanvasElement, n: number, labels: TextLabel[]) => void) {
  if (isPdf) {
    const pdfjs = await import('pdfjs-dist')
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = worker
    const doc = await pdfjs.getDocument({ url }).promise
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: DISPLAY_W / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      // The page's own text, placed where it's drawn: a digital catalogue
      // prints each colour's code as text beside its swatch.
      const text = await page.getTextContent()
      const labels: TextLabel[] = []
      for (const item of text.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const tx = pdfjs.Util.transform(viewport.transform, item.transform)
        const h = Math.hypot(tx[2], tx[3])
        labels.push({ text: item.str, x: tx[4], y: tx[5] - h, w: item.width * viewport.scale, h })
      }
      onPage(canvas, i, labels)
    }
    return
  }
  const img = new Image()
  img.src = url
  await img.decode()
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  onPage(canvas, 1, [])
}

export function ColourReader({ supplier, document: doc, onClose }: { supplier: Supplier; document: SupplierDocument; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: materials = [] } = supplierMaterialHooks.useBySupplier(supplier.id)
  const [pages, setPages] = useState<Page[]>([])
  const [swatches, setSwatches] = useState<Swatch[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [order, setOrder] = useState<'columns' | 'rows'>('columns')
  const [start, setStart] = useState('001')
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [correct, setCorrect] = useState(true)
  // Codes as printed in the file (a digital PDF), or counted from a first code (a scan or photo).
  const [codeSource, setCodeSource] = useState<'printed' | 'numbered'>('numbered')
  const [showAll, setShowAll] = useState(false)
  // The pages that are swatch cards, worked out once the whole file is read.
  const [cardPageNums, setCardPageNums] = useState<Set<number> | null>(null)
  const [target, setTarget] = useState<number | 'new'>('new')
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [saving, setSaving] = useState(false)
  const nextId = useRef(1)

  // Default to the supplier's only material, when there is just one.
  useEffect(() => { if (materials.length === 1) setTarget(materials[0].id) }, [materials])

  useEffect(() => {
    let cancelled = false
    const isPdf = /\.pdf$/i.test(doc.file_name)
    const found: Page[] = []
    const all: Swatch[] = []
    renderPages(doc.file_path, isPdf, (canvas, n, pageLabels) => {
      const small = document.createElement('canvas')
      small.width = DETECT_W; small.height = Math.round((canvas.height / canvas.width) * DETECT_W)
      const sctx = small.getContext('2d', { willReadFrequently: true })!
      sctx.drawImage(canvas, 0, 0, small.width, small.height)
      const data = sctx.getImageData(0, 0, small.width, small.height)
      const paper = paperColour(data)
      const k = data.width / canvas.width
      const joined = joinLabels(pageLabels.map(l => ({ ...l, x: l.x * k, y: l.y * k, w: l.w * k, h: l.h * k })))
      const found0 = detectSwatches(data, paper)
      const labelled0 = assignLabels(found0, joined)
      // Printed codes say which patches are swatches; without them, keep the
      // patches that are the size most of them are.
      const detected = labelled0.size >= 2 ? found0 : consistentSize(found0)
      const labelled = labelled0.size >= 2 ? labelled0 : assignLabels(detected, joined)
      const auto = detected.length >= MIN_PER_PAGE || labelled.size >= 1
      // On a page that prints codes, a "swatch" without one is most likely
      // something else (a photo, a banner): it starts left out.
      const pagePrints = labelled.size >= Math.max(2, detected.length / 2)
      found.push({ n, url: canvas.toDataURL('image/jpeg', 0.85), aspect: canvas.height / canvas.width, data, paper, auto, labels: joined.map(l => ({ ...l, x: l.x / data.width, y: l.y / data.height, w: l.w / data.width, h: l.h / data.height })) })
      for (const s of detected) {
        const lab = labelled.get(s)
        all.push({ id: nextId.current++, page: n, x: s.x / data.width, y: s.y / data.height, w: s.w / data.width, h: s.h / data.height, raw: s.rgb, on: auto && (!pagePrints || !!lab), printed: lab?.code ?? null, category: lab?.category ?? null })
      }
      if (!cancelled) { setPages([...found]); setSwatches([...all]) }
    }).then(() => {
      if (cancelled) return
      // Printed codes for most swatches: a digital file, whose colours are
      // exact already, so no lighting correction either.
      const on = all.filter(s => s.on)
      const printed = on.length > 0 && on.filter(s => s.printed).length >= on.length / 2
      setCodeSource(printed ? 'printed' : 'numbered')
      // With codes taken from the file, a swatch with no code beside it is a
      // cover or a photo, not a colour: it starts left out.
      const kept = printed ? all.map(s => (s.printed ? s : { ...s, on: false })) : all
      if (printed) setSwatches(kept)
      setCardPageNums(new Set(kept.filter(s => s.on).map(s => s.page)))
      setCorrect(!printed)
      setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [doc.file_path, doc.file_name])

  // Codes in reading order across the pages, from the starting code.
  const ordered = useMemo(() => pages.flatMap(p => orderSwatches(swatches.filter(s => s.page === p.n && s.on), order)), [pages, swatches, order])
  const autoCodes = useMemo(() => {
    const seq = codeSequence(start, ordered.length)
    return new Map(ordered.map((s, i) => [s.id, seq[i]]))
  }, [ordered, start])
  const suggested = (s: Swatch) => (codeSource === 'printed' ? s.printed ?? '' : autoCodes.get(s.id) ?? '')
  const codeOf = (s: Swatch) => (overrides[s.id] ?? suggested(s)).trim().toUpperCase()
  const colourOf = (s: Swatch) => {
    const paper = pages.find(p => p.n === s.page)?.paper ?? null
    return hexOf(correct ? corrected(s.raw, paper) : s.raw)
  }

  const { data: existing = [] } = supplierMaterialColorHooks.useByMaterial(target === 'new' ? undefined : target)
  const existingCodes = useMemo(() => new Set(existing.map(c => c.code.toUpperCase())), [existing])
  const codes = ordered.map(codeOf)
  const dupInFile = new Set(codes.filter((c, i) => c && codes.indexOf(c) !== i))
  const toAdd = ordered.filter(s => { const c = codeOf(s); return c && !existingCodes.has(c) && !dupInFile.has(c) })
  const skipped = ordered.length - toAdd.length

  const onPageClick = (page: Page, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height
    const hit = swatches.find(s => s.page === page.n && fx >= s.x && fx <= s.x + s.w && fy >= s.y && fy <= s.y + s.h)
    // Tapping a swatch removes it; tapping where one was removed (or where
    // the reader saw something but left it out) brings it back.
    if (hit) { setSwatches(all => all.map(s => (s.id === hit.id ? { ...s, on: !s.on, removed: s.on } : s))); return }
    // A new swatch the size of the others on this page, centred on the click.
    const same = swatches.filter(s => s.page === page.n)
    const w = same.length ? same.reduce((n, s) => n + s.w, 0) / same.length : 0.12
    const h = same.length ? same.reduce((n, s) => n + s.h, 0) / same.length : 0.09
    const box = { x: Math.max(0, fx - w / 2), y: Math.max(0, fy - h / 2), w, h }
    const raw = boxColour(page.data, { x: box.x * page.data.width, y: box.y * page.data.height, w: box.w * page.data.width, h: box.h * page.data.height })
    const lab = assignLabels([box], page.labels).get(box)
    setSwatches(all => [...all, { id: nextId.current++, page: page.n, ...box, raw, on: true, printed: lab?.code ?? null, category: lab?.category ?? null }])
  }

  const save = async () => {
    if (!toAdd.length || (target === 'new' && !newName.trim())) return
    setSaving(true)
    try {
      const materialId = target === 'new'
        ? (await supplierMaterialApi.create({ supplier_id: supplier.id, name: newName.trim(), brand: newBrand.trim() || null, composition: null, used_for: null, width_cm: null, roll_yards: null, price: 0 })).id
        : target
      let added = 0
      const failed: string[] = []
      for (const s of toAdd) {
        try {
          await supplierMaterialColorApi.create({ supplier_material_id: materialId, code: codeOf(s), category: s.category, hex: colourOf(s), unavailable: false })
          added++
        } catch { failed.push(codeOf(s)) }
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['supplier-materials'] }), qc.invalidateQueries({ queryKey: ['supplier-material-colors'] })])
      if (failed.length) toast.error(t('colourReader.someFailed', { count: failed.length, codes: failed.join(', ') }))
      toast.success(t('colourReader.added', { count: added }))
      onClose()
    } catch (e) {
      toast.error(friendlyError(e as Error))
    } finally {
      setSaving(false)
    }
  }

  const cardPages = pages.filter(p => cardPageNums?.has(p.n) || swatches.some(s => s.page === p.n && s.on))
  const otherPages = pages.filter(p => !cardPages.includes(p))
  const shownPages = showAll ? pages : cardPages
  const materialName = target === 'new' ? newName.trim() : materials.find(m => m.id === target)?.name ?? ''

  return (
    <Modal title={t('colourReader.title', { file: doc.file_name })} onClose={onClose} size="xl" guard={false}>
      <div className="space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-300">{t('colourReader.intro')}</p>

        {/* Where the colours go, and how they're numbered */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl bg-slate-50 p-3 dark:bg-navy-950">
          <label className="block lg:col-span-2">
            <span className="field-label">{t('colourReader.material')}</span>
            <select className="field" value={String(target)} onChange={e => setTarget(e.target.value === 'new' ? 'new' : Number(e.target.value))}>
              {materials.map(m => <option key={m.id} value={m.id}>{m.brand ? `${m.brand} - ${m.name}` : m.name}</option>)}
              <option value="new">{t('colourReader.newMaterial')}</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">{t('colourReader.codes')}</span>
            <select className="field" value={codeSource} onChange={e => { setCodeSource(e.target.value as 'printed' | 'numbered'); setOverrides({}) }}>
              <option value="printed">{t('colourReader.codesPrinted')}</option>
              <option value="numbered">{t('colourReader.codesNumbered')}</option>
            </select>
          </label>
          {codeSource === 'numbered' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">{t('colourReader.firstCode')}</span>
                <input className="field font-mono" value={start} onChange={e => { setStart(e.target.value); setOverrides({}) }} />
              </label>
              <label className="block">
                <span className="field-label">{t('colourReader.numbering')}</span>
                <select className="field" value={order} onChange={e => { setOrder(e.target.value as 'columns' | 'rows'); setOverrides({}) }}>
                  <option value="columns">{t('colourReader.downColumns')}</option>
                  <option value="rows">{t('colourReader.acrossRows')}</option>
                </select>
              </label>
            </div>
          ) : <p className="self-end pb-2 text-xs text-slate-500 dark:text-slate-400">{t('colourReader.printedHint')}</p>}
          {target === 'new' && (
            <>
              <label className="block lg:col-span-2">
                <span className="field-label">{t('colourReader.newMaterialName')}</span>
                <UppercaseField className="field" value={newName} onChange={setNewName} placeholder="e.g. RIPSTOP" />
              </label>
              <label className="block lg:col-span-2">
                <span className="field-label">{t('colourReader.brandOptional')}</span>
                <UppercaseField className="field" value={newBrand} onChange={setNewBrand} placeholder="e.g. PERNUSA" />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input type="checkbox" checked={correct} onChange={e => setCorrect(e.target.checked)} />
            <span>{t('colourReader.correctLighting')}</span>
          </label>
        </div>

        {status === 'loading' && pages.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden /> {t('colourReader.reading')}
          </div>
        )}
        {status === 'error' && <p className="text-sm text-red-600 py-6 text-center dark:text-red-400">{t('colourReader.loadError')}</p>}
        {status === 'ready' && ordered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <ScanSearch size={24} className="opacity-60" aria-hidden />
            <p>{t('colourReader.noneFound')}</p>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">{t('colourReader.howToFix')}</p>

        {shownPages.map(page => {
          const onPage = orderSwatches(swatches.filter(s => s.page === page.n && s.on), order)
          const removed = swatches.filter(s => s.page === page.n && !s.on && s.removed)
          return (
            <section key={page.n} className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-x-5 lg:gap-y-2 lg:items-start">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('colourReader.pageN', { n: page.n, count: onPage.length })}
                </h3>
                {removed.length > 0 && (
                  <button type="button" className="text-xs text-navy-600 underline underline-offset-2 dark:text-navy-300"
                    onClick={() => setSwatches(all => all.map(s => (s.page === page.n && s.removed && !s.on ? { ...s, on: true, removed: false } : s)))}>
                    {t('colourReader.bringBack', { count: removed.length })}
                  </button>
                )}
              </div>
              <div className="relative w-full max-w-[560px] cursor-crosshair select-none rounded-lg overflow-hidden border border-slate-200 dark:border-navy-700"
                style={{ aspectRatio: `1 / ${page.aspect}` }} onClick={e => onPageClick(page, e)}>
                <img src={page.url} alt={t('colourReader.pageAlt', { n: page.n })} className="absolute inset-0 w-full h-full" draggable={false} />
                {/* Only the swatches being added are marked; a removed one
                    leaves the page as it was, not a hollow box over it. */}
                {onPage.map(s => (
                  <span key={s.id}
                    className="absolute rounded-sm ring-2 ring-fuchsia-500 shadow-[0_0_0_3px_rgba(255,255,255,0.8)]"
                    style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}>
                    <span className="absolute left-0 top-0 px-1 text-[9px] sm:text-[10px] font-mono font-bold leading-4 whitespace-nowrap bg-fuchsia-600 text-white">{codeOf(s)}</span>
                  </span>
                ))}
              </div>
              {onPage.length > 0 && (
                <div className="flex flex-wrap content-start gap-2">
                  {onPage.map(s => {
                    const code = codeOf(s)
                    const clash = !code ? t('colourReader.missingCode') : existingCodes.has(code) ? t('colourReader.alreadyThere') : dupInFile.has(code) ? t('colourReader.duplicate') : null
                    return (
                      <label key={s.id} className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 ${clash ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-navy-700'}`} title={clash ?? colourOf(s)}>
                        <span className="w-5 h-5 rounded-full ring-1 ring-black/10 shrink-0" style={{ background: colourOf(s) }} aria-hidden />
                        <input
                          className="w-14 bg-transparent font-mono text-xs outline-none uppercase"
                          value={overrides[s.id] ?? suggested(s)}
                          placeholder={t('colourReader.noCode')}
                          aria-label={t('colourReader.codeFor', { hex: colourOf(s) })}
                          onChange={e => setOverrides(o => ({ ...o, [s.id]: e.target.value }))}
                        />
                        {s.category && <span className="text-[10px] text-slate-500 dark:text-slate-400">{s.category}</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}

        {status === 'ready' && otherPages.length > 0 && (
          <button type="button" className="text-xs text-navy-600 underline dark:text-navy-300" onClick={() => setShowAll(v => !v)}>
            {showAll ? t('colourReader.hideOtherPages') : t('colourReader.showOtherPages', { count: otherPages.length })}
          </button>
        )}

        {/* What will happen */}
        <div className="sticky bottom-0 -mx-1 flex items-center gap-2 sm:gap-3 border-t border-slate-200 bg-white px-1 pt-3 dark:border-navy-700 dark:bg-navy-900">
          <p className="text-xs sm:text-sm text-slate-600 flex-1 min-w-0 dark:text-slate-300">
            {materialName
              ? t('colourReader.summary', { count: toAdd.length, material: materialName })
              : t('colourReader.pickMaterial')}
            {skipped > 0 && <span className="text-amber-700 dark:text-amber-400" title={t('colourReader.skippedWhy')}> · {t('colourReader.skipped', { count: skipped })}</span>}
          </p>
          {/* On a phone the sheet's own close button is the cancel. */}
          <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary shrink-0" disabled={saving || status !== 'ready' || !toAdd.length || !materialName} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {t('colourReader.addButton', { count: toAdd.length })}
          </button>
        </div>
      </div>
    </Modal>
  )
}
