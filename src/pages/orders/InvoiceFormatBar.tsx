import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Eraser, Italic, Minus, MousePointerClick, Plus, RotateCcw, SquareSplitHorizontal, TableCellsMerge, X } from 'lucide-react'
import { BORDER_PRESETS, FILL_PALETTE, TEXT_PALETTE, TEXT_SIZE_LIMITS, type BorderLine, type BorderPreset, type BorderSide, type CellAlign, type CellBorders, type FormatScope } from '@/utils/InvoiceLayoutStore'

export interface FormatTarget {
  /** What's selected, e.g. "KETERANGAN · APRON". */
  where: string
  /** How the selected cell looks now. */
  current: { bold: boolean; italic: boolean; align: CellAlign; size: number; color: string }
  /** The fill the scope has, if any. */
  fill?: string
  /** The row's height, px at full size, and its usual height. */
  height: number
  baseHeight: number
  /** More than one cell selected (Shift+click, or Select more on a phone). */
  cells: number
  /** Whether the selection can be merged, or is a merged cell. */
  canMerge: boolean
  merged: boolean
  /** The cell's text was typed over (Reset text puts its own back). */
  customText: boolean
}

/** A small square showing which edges a border choice draws. */
function BorderIcon({ borders, size = 16 }: { borders?: CellBorders; size?: number }) {
  const edge = (side: BorderSide, line: BorderLine | undefined) => {
    const pos = { top: [2, 2, 14, 2], bottom: [2, 14, 14, 14], left: [2, 2, 2, 14], right: [14, 2, 14, 14] }[side]
    const on = line && line !== 'none'
    return (
      <g key={side}>
        <line x1={pos[0]} y1={pos[1]} x2={pos[2]} y2={pos[3]} stroke="currentColor" strokeWidth={on ? (line === 'thick' ? 2.5 : 1.3) : 1}
          strokeDasharray={on ? undefined : '1.5 1.5'} opacity={on ? 1 : 0.35} />
        {line === 'double' && <line x1={pos[0]} y1={pos[1] - 2.5} x2={pos[2]} y2={pos[3] - 2.5} stroke="currentColor" strokeWidth={1} />}
      </g>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      {(['top', 'right', 'bottom', 'left'] as BorderSide[]).map(s => edge(s, borders?.[s]))}
    </svg>
  )
}

/** A button that opens a small menu under it (computer); closes on a click
 *  outside or Esc. */
function Popover({ label, title, button, children }: { label: string; title?: string; button: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={label} title={title ?? label}
        className={`h-8 px-1.5 inline-flex items-center gap-1 rounded-md border transition-colors ${open ? 'border-navy-700 bg-slate-50' : 'bg-white border-slate-200 hover:border-slate-300'} text-slate-600`}>
        {button}<ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 bg-white rounded-lg border border-slate-200 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)] p-2">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Formatting the invoice table like Excel: for the selected cell (or block
 *  of cells), its row or its column — bold, italic, alignment, text size and
 *  colour, fill, borders — plus the row's height, merging cells, and putting
 *  back a typed-over cell's own text.
 *  - `bar` (computer): one row under the toolbar while a cell is selected;
 *    colour, fill and borders open small menus.
 *  - `panel` (phone): a panel at the bottom while Format cells is on, with
 *    finger-sized controls; before a cell is tapped it says to tap one. */
export function InvoiceFormatBar({ variant = 'bar', target, scope, onScope, onBold, onItalic, onAlign, onSize, onColor, onFill, onBorders, onHeight, onMerge, onUnmerge, onResetText, onClear, onClose, extend, onExtend }: {
  variant?: 'bar' | 'panel'
  /** The selected cell; null (phone, nothing tapped yet) shows a hint. */
  target: FormatTarget | null
  scope: FormatScope
  onScope: (s: FormatScope) => void
  onBold: () => void
  onItalic: () => void
  onAlign: (a: CellAlign) => void
  onSize: (px: number | null) => void
  onColor: (color: string | null) => void
  onFill: (color: string | null) => void
  onBorders: (preset: BorderPreset) => void
  onHeight: (px: number | null) => void
  onMerge: () => void
  onUnmerge: () => void
  onResetText: () => void
  onClear: () => void
  onClose: () => void
  /** Phone: taps add to the selection instead of starting a new one. */
  extend?: boolean
  onExtend?: () => void
}) {
  const { t } = useTranslation()
  const panel = variant === 'panel'
  const btn = (on: boolean) =>
    `${panel ? 'w-11 h-11 rounded-lg' : 'w-8 h-8 rounded-md'} inline-flex items-center justify-center border transition-colors disabled:opacity-40 ${
      on ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`
  const swatch = panel ? 'w-9 h-9' : 'w-6 h-6'
  const icon = panel ? 18 : 15
  const scopes: { value: FormatScope; label: string }[] = [
    { value: 'cell', label: target && target.cells > 1 ? t('invoiceFormat.cells', { count: target.cells }) : t('invoiceFormat.cell') },
    { value: 'row', label: t('invoiceFormat.row') },
    { value: 'column', label: t('invoiceFormat.column') },
  ]
  const aligns: { value: CellAlign; icon: typeof AlignLeft; label: string }[] = [
    { value: 'left', icon: AlignLeft, label: t('invoiceFormat.alignLeft') },
    { value: 'center', icon: AlignCenter, label: t('invoiceFormat.alignCenter') },
    { value: 'right', icon: AlignRight, label: t('invoiceFormat.alignRight') },
  ]
  const borderChoices: { value: BorderPreset; label: string }[] = [
    { value: 'all', label: t('invoiceFormat.borderAll') },
    { value: 'box', label: t('invoiceFormat.borderBox') },
    { value: 'bottom', label: t('invoiceFormat.borderBottom') },
    { value: 'bottomThick', label: t('invoiceFormat.borderBottomThick') },
    { value: 'bottomDouble', label: t('invoiceFormat.borderBottomDouble') },
    { value: 'top', label: t('invoiceFormat.borderTop') },
    { value: 'none', label: t('invoiceFormat.borderNone') },
    { value: 'reset', label: t('invoiceFormat.borderReset') },
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
  const extendToggle = panel && onExtend && (
    <button type="button" onClick={onExtend} aria-pressed={!!extend}
      className={`h-10 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 ${extend ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-200'}`}>
      <TableCellsMerge size={16} aria-hidden /> {t('invoiceFormat.selectMore')}
    </button>
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
          className={`${panel ? 'flex-1 h-10 text-sm' : 'px-2.5 py-1'} rounded-md font-medium whitespace-nowrap ${scope === s.value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800'}`}>
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
  const { min, max, step: sizeStep } = TEXT_SIZE_LIMITS
  const sizeControl = (
    <div className="inline-flex items-center gap-1">
      <span className="text-slate-500 mr-0.5">{t('invoiceFormat.textSize')}</span>
      <button type="button" className={btn(false)} disabled={target.current.size <= min} onClick={() => onSize(Math.max(min, target.current.size - sizeStep))} aria-label={t('invoiceFormat.smallerText')}><Minus size={icon - 1} /></button>
      <span className="w-9 text-center tabular-nums text-slate-700">{target.current.size}</span>
      <button type="button" className={btn(false)} disabled={target.current.size >= max} onClick={() => onSize(Math.min(max, target.current.size + sizeStep))} aria-label={t('invoiceFormat.biggerText')}><Plus size={icon - 1} /></button>
    </div>
  )
  const ring = (on: boolean) => (on ? 'ring-2 ring-navy-700 ring-offset-1' : 'border border-slate-300')
  const noneSwatch = (on: boolean, onClick: () => void, label: string) => (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} title={label} aria-label={label}
      className={`${swatch} rounded-full bg-white relative overflow-hidden !min-h-0 ${ring(on)}`}>
      <span aria-hidden className="absolute left-1/2 top-0 h-full w-px bg-red-400 rotate-45" />
    </button>
  )
  const colorSwatches = (close?: () => void) => (
    <div className={`flex items-center flex-wrap ${panel ? 'gap-2' : 'gap-1.5 w-[11.5rem]'}`} role="radiogroup" aria-label={t('invoiceFormat.textColor')}>
      {TEXT_PALETTE.map(c => (
        <button key={c.value} type="button" role="radio" aria-checked={target.current.color === c.value} onClick={() => { onColor(c.value === '#000000' ? null : c.value); close?.() }} title={c.name} aria-label={c.name}
          className={`${swatch} rounded-full !min-h-0 ${ring(target.current.color === c.value)}`} style={{ background: c.value }} />
      ))}
    </div>
  )
  const fillSwatches = (close?: () => void) => (
    <div className={`flex items-center flex-wrap ${panel ? 'gap-2' : 'gap-1.5 w-[13rem]'}`} role="radiogroup" aria-label={t('invoiceFormat.fill')}>
      {noneSwatch(!target.fill, () => { onFill(null); close?.() }, t('invoiceFormat.noFill'))}
      {FILL_PALETTE.map(c => (
        <button key={c.value} type="button" role="radio" aria-checked={target.fill === c.value} onClick={() => { onFill(c.value); close?.() }} title={c.name} aria-label={c.name}
          className={`${swatch} rounded-full !min-h-0 ${ring(target.fill === c.value)}`} style={{ background: c.value }} />
      ))}
    </div>
  )
  const borderGrid = (close?: () => void) => (
    <div className={`grid ${panel ? 'grid-cols-4 gap-2' : 'grid-cols-2 gap-1 w-[15rem]'}`}>
      {borderChoices.map(b => (
        <button key={b.value} type="button" onClick={() => { onBorders(b.value); close?.() }}
          className={`${panel ? 'h-14 flex-col justify-center text-[11px] leading-tight' : 'h-8 px-2 text-xs'} inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 text-left`}>
          {b.value === 'reset' ? <RotateCcw size={panel ? 16 : 14} aria-hidden /> : <BorderIcon borders={BORDER_PRESETS[b.value]} size={panel ? 18 : 16} />}
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  )
  const heightControl = (
    <div className="inline-flex items-center gap-1">
      <span className="text-slate-500 mr-0.5">{t('invoiceFormat.rowHeight')}</span>
      <button type="button" className={btn(false)} disabled={target.height <= target.baseHeight} onClick={() => onHeight(target.height - step <= target.baseHeight ? null : target.height - step)} aria-label={t('invoiceFormat.shorter')}><Minus size={icon - 1} /></button>
      <span className="w-10 text-center tabular-nums text-slate-700">{target.height}px</span>
      <button type="button" className={btn(false)} disabled={target.height >= 200} onClick={() => onHeight(Math.min(200, target.height + step))} aria-label={t('invoiceFormat.taller')}><Plus size={icon - 1} /></button>
    </div>
  )
  const linkBtn = 'tap inline-flex items-center gap-1 px-2 rounded-md text-slate-600 hover:bg-slate-100 whitespace-nowrap'
  const mergeButton = target.merged
    ? <button type="button" onClick={onUnmerge} className={linkBtn} title={t('invoiceFormat.unmergeTitle')}><SquareSplitHorizontal size={icon - 1} aria-hidden /> {t('invoiceFormat.unmerge')}</button>
    : target.cells > 1
      ? <button type="button" onClick={onMerge} disabled={!target.canMerge} className={`${linkBtn} disabled:opacity-40`} title={target.canMerge ? t('invoiceFormat.mergeTitle') : t('invoiceFormat.mergeNo')}><TableCellsMerge size={icon - 1} aria-hidden /> {t('invoiceFormat.merge')}</button>
      : null
  const resetTextButton = target.customText && (
    <button type="button" onClick={onResetText} className={linkBtn} title={t('invoiceFormat.resetTextTitle')}><RotateCcw size={icon - 1} aria-hidden /> {t('invoiceFormat.resetText')}</button>
  )
  const clearButton = (
    <button type="button" onClick={onClear} className={linkBtn} title={t('invoiceFormat.clearTitle')}>
      <Eraser size={icon - 1} aria-hidden /> {t('invoiceFormat.clear')}
    </button>
  )

  if (panel) {
    const section = (label: string, body: React.ReactNode) => (
      <div className="space-y-1.5"><p className="text-xs font-medium text-slate-500">{label}</p>{body}</div>
    )
    return (
      <div data-format-bar className="print:hidden fixed inset-x-0 bottom-0 z-30 max-h-[55vh] overflow-y-auto bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.3)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3 text-sm">
        {header}
        {scopeSwitch}
        <div className="flex items-center justify-between gap-3">{styleButtons}{alignButtons}</div>
        <div className="flex items-center justify-between gap-3">{sizeControl}</div>
        {section(t('invoiceFormat.textColor'), colorSwatches())}
        {section(t('invoiceFormat.fill'), fillSwatches())}
        {section(t('invoiceFormat.borders'), borderGrid())}
        <div className="flex items-center justify-between gap-3">{heightControl}</div>
        <div className="flex flex-wrap items-center gap-2">{extendToggle}{mergeButton}{resetTextButton}{clearButton}</div>
      </div>
    )
  }
  return (
    <div data-format-bar className="print:hidden bg-white border-b border-slate-200 px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {header}
      {scopeSwitch}
      {styleButtons}
      {alignButtons}
      {sizeControl}
      <div className="inline-flex items-center gap-1.5">
        <Popover label={t('invoiceFormat.textColor')} button={<span className="flex flex-col items-center leading-none font-semibold text-[13px] text-slate-700 px-0.5">A<span className="block w-3.5 h-[3px] mt-0.5 rounded-sm" style={{ background: target.current.color }} /></span>}>
          {close => colorSwatches(close)}
        </Popover>
        <Popover label={t('invoiceFormat.fill')} button={<span className={`block w-4 h-4 rounded ${target.fill ? '' : 'border border-slate-300'}`} style={{ background: target.fill ?? '#fff' }} />}>
          {close => fillSwatches(close)}
        </Popover>
        <Popover label={t('invoiceFormat.borders')} button={<BorderIcon borders={BORDER_PRESETS.all} />}>
          {close => borderGrid(close)}
        </Popover>
      </div>
      {heightControl}
      <div className="inline-flex items-center gap-1 ml-auto">
        {mergeButton}
        {resetTextButton}
        {clearButton}
        <button type="button" onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}><X size={15} /></button>
      </div>
    </div>
  )
}
