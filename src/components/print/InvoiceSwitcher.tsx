import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Search, X, PanelLeftClose } from 'lucide-react'
import { invoiceSheetApi, itemsApi } from '@/api'
import { useDialog } from '@/hooks/useDialog'
import { useDateLocale } from '@/i18n/dateLocale'
import { isFullInvoice } from '@/utils/invoiceAmount'
import { isPastDue } from '@/utils/orderStatus'
import type { Invoice } from '@/types'

const TYPE_TAG: Record<string, string> = {
  dp: 'text-blue-700 bg-blue-50',
  pelunasan: 'text-purple-700 bg-purple-50',
}

/** Every invoice, newest first, to jump between them from the print page.
 *  On a computer a panel down the left under the toolbar ("side"); on a
 *  phone a full-screen list ("sheet"). */
export function InvoiceSwitcher({ variant, invoices, currentId, onPick, onClose }: {
  variant: 'side' | 'sheet'
  invoices: Invoice[]
  currentId: string
  onPick: (inv: Invoice) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => [...invoices].sort((a, b) =>
    (b.tanggal ?? '').localeCompare(a.tanggal ?? '') || b.id.localeCompare(a.id, undefined, { numeric: true })
  ), [invoices])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(inv => [inv.id, inv.kepada_yth, inv.untuk, inv.order_id].some(v => v?.toLowerCase().includes(q)))
  }, [sorted, query])

  // The open invoice in the middle of the list when it opens, then kept in
  // view as others are picked.
  const opened = useRef(false)
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: opened.current ? 'nearest' : 'center' })
    opened.current = true
  }, [currentId])

  // An invoice's lines and formatting start loading as the pointer reaches
  // it, so the page is ready (or nearly) by the click.
  const preload = (inv: Invoice) => {
    qc.prefetchQuery({ queryKey: ['items', inv.order_id], queryFn: () => itemsApi.getByOrder(inv.order_id), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['invoice-sheet', inv.id], queryFn: () => invoiceSheetApi.get(inv.id), staleTime: Infinity })
  }

  // ↑/↓ in the list open the previous/next invoice; ↓ from the search box
  // goes into the list, Enter there opens the first match.
  const buttons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-inv]') ?? [])
  const step = (from: HTMLElement | null, dir: 1 | -1) => {
    const all = buttons()
    const i = from ? all.indexOf(from as HTMLButtonElement) : -1
    const next = all[i < 0 ? 0 : Math.min(all.length - 1, Math.max(0, i + dir))]
    if (!next || next === from) return
    next.focus()
    next.click()
  }
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    step(document.activeElement as HTMLElement, e.key === 'ArrowDown' ? 1 : -1)
  }
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const all = buttons()
      ;(all.find(b => b.getAttribute('aria-current') === 'page') ?? all[0])?.focus()
    } else if (e.key === 'Enter' && shown[0]) {
      e.preventDefault()
      onPick(shown[0])
    }
  }

  let lastMonth = ''
  const list = (
    <div ref={listRef} onKeyDown={onListKey} className="flex-1 overflow-y-auto overscroll-contain pb-3">
      {shown.length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('invoiceSwitcher.empty')}</p>}
      {shown.map(inv => {
        const month = inv.tanggal ? format(new Date(inv.tanggal), 'MMMM yyyy', { locale: dateLocale }) : ''
        const heading = month !== lastMonth ? month : null
        lastMonth = month
        const current = inv.id === currentId
        const typeLabel = isFullInvoice(inv) ? t('invoiceList.fullInvoice') : inv.type === 'dp' ? 'DP' : 'Pelunasan'
        const paid = inv.status === 'paid'
        const overdue = !paid && isPastDue(inv)
        return (
          <div key={inv.id}>
            {heading && (
              <div className="sticky top-0 z-[1] bg-white px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {heading}
              </div>
            )}
            <button
              type="button"
              data-inv
              aria-current={current ? 'page' : undefined}
              onPointerEnter={() => preload(inv)}
              onFocus={() => preload(inv)}
              onClick={() => { if (!current) onPick(inv) }}
              className={`group relative w-[calc(100%-1rem)] mx-2 text-left rounded-lg px-3 py-2 outline-none transition-colors
                focus-visible:ring-2 focus-visible:ring-navy-300
                ${current ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
            >
              {current && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-navy-700" />}
              <span className="flex items-center gap-2">
                <span className={`flex-1 min-w-0 truncate text-sm tabular-nums ${current ? 'font-semibold text-navy-900' : 'font-medium text-slate-800'}`}>{inv.id}</span>
                <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${TYPE_TAG[inv.type] ?? 'text-slate-600 bg-slate-100'}`}>{typeLabel}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="flex-1 min-w-0 truncate">{inv.kepada_yth || '—'}</span>
                {paid && <span className="shrink-0 text-green-700">{t('common.paid')}</span>}
                {overdue && <span className="shrink-0 text-red-600">{t('dashboardKpi.paymentStatus.overdue')}</span>}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )

  const search = (
    <div className="px-3 pb-2"><div className="relative">
      <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onSearchKey}
        placeholder={t('invoiceSwitcher.search')}
        aria-label={t('invoiceSwitcher.search')}
        className="field !pl-8 text-sm"
      />
    </div></div>
  )

  if (variant === 'side') {
    return (
      <aside
        aria-label={t('invoiceSwitcher.title')}
        className="print:hidden fixed left-0 bottom-0 z-[9] w-72 bg-white border-r border-slate-200 flex flex-col"
        style={{ top: 'var(--print-toolbar-h, 57px)' }}
      >
        <div className="flex items-center gap-2 pl-4 pr-2 pt-3 pb-2">
          <h2 className="flex-1 text-sm font-semibold text-navy-900">
            {t('invoiceSwitcher.title')} <span className="font-normal text-slate-400 tabular-nums">{invoices.length}</span>
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded text-slate-500 hover:text-navy-900 hover:bg-slate-100"
            title={t('invoiceSwitcher.hide')} aria-label={t('invoiceSwitcher.hide')}>
            <PanelLeftClose size={16} />
          </button>
        </div>
        {search}
        {list}
      </aside>
    )
  }

  return <PhoneSheet onClose={onClose} title={t('invoiceSwitcher.title')} closeLabel={t('common.close')}>{search}{list}</PhoneSheet>
}

function PhoneSheet({ onClose, title, closeLabel, children }: {
  onClose: () => void
  title: string
  closeLabel: string
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose)
  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className="print:hidden fixed inset-0 z-40 bg-white flex flex-col slide-up outline-none pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        <button type="button" onClick={onClose} className="btn-ghost !px-0" aria-label={closeLabel}><X size={20} /></button>
      </div>
      {children}
    </div>
  )
}
