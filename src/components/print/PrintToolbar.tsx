import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Printer, Settings2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useDialog } from '@/hooks/useDialog'
import type { PrintLayoutState } from '@/hooks/usePrintLayout'
import { PrintLayoutToggle } from './PrintLayoutPanel'
import type { PreviewZoom } from '@/hooks/usePreviewZoom'

/** The bar above every print page (invoice, kwitansi, SJ/DO, reports).
 *  On a computer: Back, the title, the page's own tools, Layout and Print in
 *  one row. On a phone one short row only — back arrow, title, Layout,
 *  Tools, Print — with the page's tools in a sheet from the bottom, so the
 *  page itself keeps the screen instead of five rows of buttons. */
export function PrintToolbar({ title, onBack, onPrint, layout, tools, pinned, below, leading }: {
  title: React.ReactNode
  /** Computer: a control right after Back (the invoice list's toggle). */
  leading?: React.ReactNode
  onBack: () => void
  onPrint: () => void
  layout?: { state: PrintLayoutState; open: boolean; onToggle: () => void }
  /** The page's own controls: inline on a computer, in Tools on a phone. */
  tools?: React.ReactNode
  /** Computer: a row that stays stuck under the bar while the page scrolls
   *  (the invoice's Format bar). */
  pinned?: React.ReactNode
  /** A second row of controls (the invoice's page breaks): under the bar on
   *  a computer, scrolling with the page, and at the end of Tools on a phone. */
  below?: React.ReactNode
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [toolsOpen, setToolsOpen] = useState(false)
  const hasTools = !!(tools || below)
  // The bar's height as --print-toolbar-h, for panels fixed just under it
  // (the invoice list); it's the first thing on the page, so its bottom.
  const barRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const root = document.documentElement
    const update = () => root.style.setProperty('--print-toolbar-h', `${Math.round(bar.offsetHeight)}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(bar)
    return () => { ro.disconnect(); root.style.removeProperty('--print-toolbar-h') }
  }, [isMobile])

  if (!isMobile) {
    return (
      <>
        <div ref={barRef} data-print-toolbar className="print:hidden sticky top-0 z-10">
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="btn-secondary flex items-center gap-1.5 text-sm">
            <ArrowLeft size={14} /> {t('printToolbar.back')}
          </button>
          {leading}
          <span className="text-slate-400 text-sm flex-1 flex items-center gap-1.5 min-w-0">{title}</span>
          {tools}
          {layout && <PrintLayoutToggle state={layout.state} open={layout.open} onToggle={layout.onToggle} />}
          <button onClick={onPrint} className="btn-primary flex items-center gap-2">
            <Printer size={14} /> {t('printLayout.print')}
          </button>
        </div>
        {pinned}
        </div>
        {below}
      </>
    )
  }

  return (
    <>
      <div data-print-toolbar className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-1.5 py-1.5 flex items-center gap-1">
        <button onClick={onBack} className="btn-ghost !px-0" aria-label={t('printToolbar.back')} title={t('printToolbar.back')}>
          <ArrowLeft size={20} />
        </button>
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-600 flex items-center gap-1.5">{title}</span>
        {/* Every button here says what it is. With tools, Layout is the
            first of them; without, it has the bar to itself. */}
        {hasTools ? (
          <button onClick={() => setToolsOpen(true)} className="btn-secondary !px-3 flex items-center gap-1.5 relative">
            <Settings2 size={17} aria-hidden /> {t('printToolbar.tools')}
            {layout?.state.dirty && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" aria-label={t('printLayout.unsavedShort')} />}
          </button>
        ) : layout && <PrintLayoutToggle compact state={layout.state} open={layout.open} onToggle={layout.onToggle} />}
        <button onClick={onPrint} className="btn-primary !px-3 flex items-center gap-1.5">
          <Printer size={16} /> {t('printToolbar.print')}
        </button>
      </div>
      {toolsOpen && (
        <ToolsSheet onClose={() => setToolsOpen(false)}>
          {layout && (
            <div>
              <PrintLayoutToggle compact state={layout.state} open={layout.open} onToggle={() => { setToolsOpen(false); layout.onToggle() }} />
            </div>
          )}
          {tools}{below}
        </ToolsSheet>
      )}
    </>
  )
}

function ToolsSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose)
  return (
    <div className="print:hidden fixed inset-0 z-40 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('printToolbar.tools')} tabIndex={-1}
        className="w-full max-h-[75vh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl slide-up outline-none pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-navy-900">{t('printToolbar.tools')}</h2>
          <button onClick={onClose} className="btn-ghost !px-0" aria-label={t('common.close')}><X size={18} /></button>
        </div>
        {/* The page's own controls, each a full-size row to tap. One marked
            data-close-tools closes the sheet as it does its job. */}
        <div onClick={e => { if ((e.target as HTMLElement).closest('[data-close-tools]')) onClose() }} className="px-4 pt-3 flex flex-wrap items-center gap-2 [&_button]:min-h-[2.75rem] [&_button]:text-sm [&_select]:min-h-[2.75rem] [&>div]:w-full [&>div]:flex-wrap">
          {children}
        </div>
      </div>
    </div>
  )
}

/** Phones: switches the page preview between fitting the screen and its real size. */
export function ZoomButton({ zoom, hidden }: { zoom: PreviewZoom; hidden?: boolean }) {
  const { t } = useTranslation()
  if (!zoom.isMobile || hidden) return null
  return (
    <button
      type="button"
      onClick={zoom.toggle}
      className="print:hidden fixed z-20 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] inline-flex items-center gap-1.5 h-12 px-4 rounded-full bg-navy-900 text-white text-sm font-medium shadow-[0_8px_24px_-6px_rgba(15,23,42,0.45)] active:scale-95 transition-transform"
    >
      {zoom.actual ? <ZoomOut size={18} aria-hidden /> : <ZoomIn size={18} aria-hidden />}
      {zoom.actual ? t('printToolbar.zoomFit') : t('printToolbar.zoomActual')}
    </button>
  )
}
