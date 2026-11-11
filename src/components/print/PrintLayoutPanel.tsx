import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, X } from 'lucide-react'
import type { PrintLayoutState } from '@/hooks/usePrintLayout'
import { PRINT_FONTS, PRINT_LIMITS, type LogoPosition, type PrintDocType, type PrintFont, type PrintLayout } from '@/utils/printLayout'

/** The toolbar button that opens the Layout panel; a dot shows a change
 *  that isn't saved yet. */
export function PrintLayoutToggle({ state, open, onToggle }: { state: PrintLayoutState; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`relative px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 ${
        open ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
      }`}
    >
      <SlidersHorizontal size={13} aria-hidden /> {t('printLayout.button')}
      {state.dirty && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" aria-label={t('printLayout.unsavedShort')} />}
    </button>
  )
}

/** Room the page leaves for the panel on wide screens, so the preview
 *  shrinks beside it instead of hiding under it. */
export const PANEL_ROOM_CLASS = 'lg:pr-[352px]'

const SIZE_FIELDS: { key: keyof typeof PRINT_LIMITS & keyof PrintLayout; label: string }[] = [
  { key: 'companySize', label: 'printLayout.companySize' },
  { key: 'titleSize', label: 'printLayout.titleSize' },
  { key: 'detailsSize', label: 'printLayout.detailsSize' },
  { key: 'bodySize', label: 'printLayout.bodySize' },
  { key: 'footerSize', label: 'printLayout.footerSize' },
]

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function Slider({ id, label, hint, value, display, limits, disabled, onChange }: {
  id: string
  label: string
  hint?: string
  value: number
  display: string
  limits: { min: number; max: number; step: number }
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm text-slate-700">{label}</label>
        <span className="text-xs tabular-nums text-slate-500">{display}</span>
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <input
        id={id}
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-navy-900 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  )
}

/** Where the print page's toolbar ends (it wraps onto two rows on narrower
 *  screens), so the panel starts just below it. */
function useToolbarBottom(active: boolean) {
  const [bottom, setBottom] = useState(57)
  useLayoutEffect(() => {
    if (!active) return
    const bar = document.querySelector<HTMLElement>('[data-print-toolbar]')
    if (!bar) return
    const update = () => setBottom(Math.max(0, Math.round(bar.getBoundingClientRect().bottom)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [active])
  return bottom
}

/** Changing how a kind of document looks: font, logo, text sizes and
 *  spacing. Changes show on the page as they're made; Save keeps them for
 *  everyone. */
export function PrintLayoutPanel({ docType, state, open, onClose }: {
  docType: PrintDocType
  state: PrintLayoutState
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const top = useToolbarBottom(open)
  if (!open) return null
  const { layout, change } = state
  const logoOptions: { value: LogoPosition; label: string }[] = [
    { value: 'left', label: t('printLayout.logoLeft') },
    { value: 'center', label: t('printLayout.logoCenter') },
    { value: 'right', label: t('printLayout.logoRight') },
    { value: 'none', label: t('printLayout.logoNone') },
  ]

  return (
    <aside
      className="print:hidden fixed z-20 bg-white border-slate-200 flex flex-col shadow-[0_8px_30px_rgba(15,23,42,0.12)]
        inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl border-t
        lg:inset-x-auto lg:right-0 lg:top-[var(--pl-top)] lg:bottom-0 lg:max-h-none lg:w-[336px] lg:rounded-none lg:border-t-0 lg:border-l"
      style={{ '--pl-top': `${top}px` } as React.CSSProperties}
      aria-label={t('printLayout.title', { doc: t(`printLayout.doc.${docType}`) })}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">{t('printLayout.title', { doc: t(`printLayout.doc.${docType}`) })}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('printLayout.sharedNote')}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 -m-1 rounded text-slate-500 hover:text-navy-900 hover:bg-slate-100" aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <label htmlFor="pl-font" className="text-sm text-slate-700">{t('printLayout.font')}</label>
          <select id="pl-font" className="field mt-1" value={layout.font} onChange={e => change({ font: e.target.value as PrintFont })}>
            <option value="default">{t(docType === 'invoice' ? 'printLayout.fontDefaultInvoice' : 'printLayout.fontDefault')}</option>
            {Object.entries(PRINT_FONTS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
          </select>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm text-slate-700 mb-1">{t('printLayout.logo')}</legend>
          <div className="grid grid-cols-4 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {logoOptions.map(o => (
              <button
                key={o.value}
                type="button"
                aria-pressed={layout.logoPosition === o.value}
                onClick={() => change({ logoPosition: o.value })}
                className={`py-1.5 text-xs rounded-md transition-colors ${
                  layout.logoPosition === o.value ? 'bg-white text-navy-900 font-medium shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-navy-900'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{t(`printLayout.logoHint.${docType}`)}</p>
          <Slider id="pl-logo" label={t('printLayout.logoSize')} value={layout.logoSize} display={`${fmt(layout.logoSize)} px`}
            limits={PRINT_LIMITS.logoSize} disabled={layout.logoPosition === 'none'} onChange={v => change({ logoSize: v })} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-navy-900 mb-1">{t('printLayout.textSizes')}</legend>
          {SIZE_FIELDS.map(f => (
            <Slider key={f.key} id={`pl-${f.key}`} label={t(f.label)}
              hint={docType === 'kwitansi' && f.key === 'titleSize' ? t('printLayout.kwitansiTitleHint') : undefined}
              value={layout[f.key]} display={`${fmt(layout[f.key])} px`} limits={PRINT_LIMITS[f.key]} onChange={v => change({ [f.key]: v })} />
          ))}
        </fieldset>

        <Slider id="pl-spacing" label={t('printLayout.spacing')} hint={t('printLayout.spacingHint')} value={layout.spacing}
          display={`${Math.round(layout.spacing * 100)}%`} limits={PRINT_LIMITS.spacing} onChange={v => change({ spacing: v })} />

        {/* Back to how the document printed before any layout (still needs Save). */}
        <button type="button" onClick={state.resetToDefaults} disabled={state.isDefault}
          className="text-xs text-slate-500 hover:text-navy-900 underline underline-offset-2 disabled:no-underline disabled:opacity-40 disabled:cursor-not-allowed">
          {t('printLayout.reset')}
        </button>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 space-y-2">
        {state.dirty && <p className="text-xs text-amber-700">{t('printLayout.unsaved')}</p>}
        <div className="flex items-center justify-end gap-2">
          {state.dirty && <button type="button" onClick={state.cancel} className="btn-secondary btn-sm whitespace-nowrap">{t('printLayout.discard')}</button>}
          <button type="button" onClick={state.save} disabled={!state.dirty || state.isSaving} className="btn-primary btn-sm whitespace-nowrap">
            {state.isSaving ? t('printLayout.saving') : t('printLayout.save')}
          </button>
        </div>
      </div>
    </aside>
  )
}
