import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Italic, Minus, MousePointerClick, Plus, X } from 'lucide-react'
import { FILL_PALETTE, type CellAlign, type FormatScope } from '@/utils/InvoiceLayoutStore'

export interface FormatTarget {
  /** What's selected, e.g. "KETERANGAN · APRON". */
  where: string
  /** How the selected cell looks now. */
  current: { bold: boolean; italic: boolean; align: CellAlign }
  /** The fill the scope has, if any. */
  fill?: string
  /** The row's height, px at full size, and its usual height. */
  height: number
  baseHeight: number
}

/** Formatting the invoice table like Excel: for the selected cell, its row
 *  or its column — bold, italic, alignment, a fill colour — plus the row's
 *  height.
 *  - `bar` (computer): one row under the toolbar while a cell is selected.
 *  - `panel` (phone): a panel at the bottom while Format cells is on, with
 *    finger-sized controls; before a cell is tapped it says to tap one. */
export function InvoiceFormatBar({ variant = 'bar', target, scope, onScope, onBold, onItalic, onAlign, onFill, onHeight, onClear, onClose }: {
  variant?: 'bar' | 'panel'
  /** The selected cell; null (phone, nothing tapped yet) shows a hint. */
  target: FormatTarget | null
  scope: FormatScope
  onScope: (s: FormatScope) => void
  onBold: () => void
  onItalic: () => void
  onAlign: (a: CellAlign) => void
  onFill: (color: string | null) => void
  onHeight: (px: number | null) => void
  onClear: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const panel = variant === 'panel'
  const btn = (on: boolean) =>
    `${panel ? 'w-11 h-11 rounded-lg' : 'w-8 h-8 rounded-md'} inline-flex items-center justify-center border transition-colors disabled:opacity-40 ${
      on ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`
  const swatch = panel ? 'w-9 h-9' : 'w-5 h-5'
  const icon = panel ? 18 : 15
  const scopes: { value: FormatScope; label: string }[] = [
    { value: 'cell', label: t('invoiceFormat.cell') },
    { value: 'row', label: t('invoiceFormat.row') },
    { value: 'column', label: t('invoiceFormat.column') },
  ]
  const aligns: { value: CellAlign; icon: typeof AlignLeft; label: string }[] = [
    { value: 'left', icon: AlignLeft, label: t('invoiceFormat.alignLeft') },
    { value: 'center', icon: AlignCenter, label: t('invoiceFormat.alignCenter') },
    { value: 'right', icon: AlignRight, label: t('invoiceFormat.alignRight') },
  ]
  const step = 4

  const header = (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`font-semibold text-navy-900 truncate ${panel ? 'text-sm flex-1' : 'max-w-[16rem]'}`} title={target?.where}>
        {t('invoiceFormat.title')}{target && <> · <span className="font-normal text-slate-600">{target.where}</span></>}
      </span>
      {panel && (
        <button type="button" onClick={onClose} className="btn-primary !min-h-0 h-10 !px-4 shrink-0">{t('invoiceFormat.done')}</button>
      )}
    </div>
  )

  if (panel && !target) {
    return (
      <div data-format-bar className="print:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.3)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
        {header}
        <p className="flex items-center gap-2 text-sm text-slate-600"><MousePointerClick size={18} className="text-navy-500 shrink-0" aria-hidden /> {t('invoiceFormat.tapACell')}</p>
      </div>
    )
  }
  if (!target) return null

  const scopeSwitch = (
    <div role="radiogroup" aria-label={t('invoiceFormat.applyTo')} className={`inline-flex rounded-lg bg-slate-100 p-0.5 ${panel ? 'w-full' : ''}`}>
      {scopes.map(s => (
        <button key={s.value} type="button" role="radio" aria-checked={scope === s.value} onClick={() => onScope(s.value)}
          className={`${panel ? 'flex-1 h-10 text-sm' : 'px-2.5 py-1'} rounded-md font-medium ${scope === s.value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800'}`}>
          {s.label}
        </button>
      ))}
    </div>
  )
  const styleButtons = (
    <div className="inline-flex items-center gap-1">
      <button type="button" onClick={onBold} aria-pressed={target.current.bold} className={btn(target.current.bold)} title={`${t('invoiceFormat.bold')} (Ctrl+B)`} aria-label={t('invoiceFormat.bold')}><Bold size={icon} /></button>
      <button type="button" onClick={onItalic} aria-pressed={target.current.italic} className={btn(target.current.italic)} title={`${t('invoiceFormat.italic')} (Ctrl+I)`} aria-label={t('invoiceFormat.italic')}><Italic size={icon} /></button>
    </div>
  )
  const alignButtons = (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={t('invoiceFormat.align')}>
      {aligns.map(a => (
        <button key={a.value} type="button" role="radio" aria-checked={target.current.align === a.value} onClick={() => onAlign(a.value)}
          className={btn(target.current.align === a.value)} title={a.label} aria-label={a.label}><a.icon size={icon} /></button>
      ))}
    </div>
  )
  const fills = (
    <div className={`inline-flex items-center flex-wrap ${panel ? 'gap-2' : 'gap-1.5'}`} role="radiogroup" aria-label={t('invoiceFormat.fill')}>
      <span className="text-slate-500 mr-0.5">{t('invoiceFormat.fill')}</span>
      <button type="button" role="radio" aria-checked={!target.fill} onClick={() => onFill(null)} title={t('invoiceFormat.noFill')} aria-label={t('invoiceFormat.noFill')}
        className={`${swatch} rounded-full bg-white relative overflow-hidden !min-h-0 ${!target.fill ? 'ring-2 ring-navy-700 ring-offset-1' : 'border border-slate-300'}`}>
        <span aria-hidden className="absolute left-1/2 top-0 h-full w-px bg-red-400 rotate-45" />
      </button>
      {FILL_PALETTE.map(c => (
        <button key={c.value} type="button" role="radio" aria-checked={target.fill === c.value} onClick={() => onFill(c.value)} title={c.name} aria-label={c.name}
          className={`${swatch} rounded-full !min-h-0 ${target.fill === c.value ? 'ring-2 ring-navy-700 ring-offset-1' : 'border border-slate-300'}`}
          style={{ background: c.value }} />
      ))}
    </div>
  )
  const heightControl = (
    <div className="inline-flex items-center gap-1">
      <span className="text-slate-500 mr-0.5">{t('invoiceFormat.rowHeight')}</span>
      <button type="button" className={btn(false)} disabled={target.height <= target.baseHeight} onClick={() => onHeight(target.height - step <= target.baseHeight ? null : target.height - step)} aria-label={t('invoiceFormat.shorter')}><Minus size={icon - 1} /></button>
      <span className="w-10 text-center tabular-nums text-slate-700">{target.height}px</span>
      <button type="button" className={btn(false)} disabled={target.height >= 120} onClick={() => onHeight(Math.min(120, target.height + step))} aria-label={t('invoiceFormat.taller')}><Plus size={icon - 1} /></button>
    </div>
  )
  const clearButton = (
    <button type="button" onClick={onClear} className="tap inline-flex items-center gap-1 px-2 rounded-md text-slate-600 hover:bg-slate-100" title={t('invoiceFormat.clearTitle')}>
      <Eraser size={icon - 1} aria-hidden /> {t('invoiceFormat.clear')}
    </button>
  )

  if (panel) {
    return (
      <div data-format-bar className="print:hidden fixed inset-x-0 bottom-0 z-30 max-h-[55vh] overflow-y-auto bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.3)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3 text-sm">
        {header}
        {scopeSwitch}
        <div className="flex items-center justify-between gap-3">{styleButtons}{alignButtons}</div>
        {fills}
        <div className="flex items-center justify-between gap-3">{heightControl}{clearButton}</div>
      </div>
    )
  }
  return (
    <div data-format-bar className="print:hidden bg-white border-b border-slate-200 px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {header}
      {scopeSwitch}
      {styleButtons}
      {alignButtons}
      {fills}
      {heightControl}
      <div className="inline-flex items-center gap-1 ml-auto">
        {clearButton}
        <button type="button" onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}><X size={15} /></button>
      </div>
    </div>
  )
}
