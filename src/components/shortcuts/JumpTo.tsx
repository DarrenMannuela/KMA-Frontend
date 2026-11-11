import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Banknote, BarChart3, Building2, CornerDownLeft, Factory, FileText, Keyboard, Languages, LayoutDashboard,
  ListOrdered, Moon, PiggyBank, Search, ShieldCheck, ShoppingBag, Truck, Users, Wrench,
} from 'lucide-react'
import { useDialog } from '@/hooks/useDialog'
import { useTheme } from '@/contexts/ThemeContext'
import { clientHooks, deliveryHooks, invoiceHooks, orderHooks } from '@/hooks'
import { Kbd } from './Kbd'

interface Entry {
  key: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  /** What a search matches against, lower case. */
  text: string
  run: () => void
}

const RECORDS_PER_GROUP = 6

/** "Jump to" (Ctrl+K / ⌘K): type part of a page's name, an order or invoice
 *  number, a client or a company, and Enter goes there. Pages and a few
 *  actions show before anything is typed; records show once something is. */
export function JumpTo({ onClose, onShowShortcuts, isAdmin }: { onClose: () => void; onShowShortcuts: () => void; isAdmin: boolean }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose, inputRef)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const { data: orders = [] } = orderHooks.useList()
  const { data: invoices = [] } = invoiceHooks.useList()
  const { data: clients = [] } = clientHooks.useList()
  const { data: deliveries = [] } = deliveryHooks.useList()

  const go = (path: string) => () => { onClose(); navigate(path) }
  const finance = t('sidebar.financeGroup')
  const ordersArea = t('sidebar.ordersGroup')

  const pages: Entry[] = useMemo(() => {
    const list: [string, string, LucideIcon, string?][] = [
      [t('sidebar.dashboard'), '/', LayoutDashboard],
      [t('sidebar.allOrders'), '/orders', ShoppingBag, ordersArea],
      [t('sidebar.orderItems'), '/items', ListOrdered, ordersArea],
      [t('sidebar.invoice'), '/invoice', FileText, ordersArea],
      [t('sidebar.clients'), '/clients', Building2, ordersArea],
      [t('sidebar.delivery'), '/delivery', Truck],
      [t('financeTabs.overview'), '/finance', BarChart3, finance],
      [t('common.production'), '/production', Factory, finance],
      [t('common.operations'), '/operations', Wrench, finance],
      [t('topbar.titles.buktiKas'), '/bukti-kas', Banknote, finance],
      [t('financeTabs.budgets'), '/finance/budgets', PiggyBank, finance],
      [t('topbar.titles.suppliers'), '/suppliers', Users, finance],
    ]
    if (isAdmin) list.push([t('sidebar.users'), '/admin/users', ShieldCheck])
    return list.map(([label, path, icon, hint]) => ({
      key: `page:${path}`, group: t('jumpTo.pages'), label, hint, icon,
      text: `${label} ${hint ?? ''}`.toLowerCase(), run: go(path),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, isAdmin])

  const nextLang = i18n.resolvedLanguage?.startsWith('id') ? 'en' : 'id'
  const actions: Entry[] = [
    { key: 'act:shortcuts', group: t('jumpTo.actions'), label: t('shortcuts.title'), icon: Keyboard, text: `${t('shortcuts.title')} keyboard shortcuts ?`.toLowerCase(), run: () => { onClose(); onShowShortcuts() } },
    { key: 'act:theme', group: t('jumpTo.actions'), label: theme === 'dark' ? t('topbar.switchToLight') : t('topbar.switchToDark'), icon: Moon, text: `${t('topbar.switchToLight')} ${t('topbar.switchToDark')} theme dark light`.toLowerCase(), run: () => { toggleTheme(); onClose() } },
    {
      key: 'act:lang', group: t('jumpTo.actions'),
      label: t('common.switchToLanguage', { language: nextLang === 'id' ? t('common.languageIndonesian') : t('common.languageEnglish') }),
      icon: Languages, text: 'language bahasa english indonesia', run: () => { i18n.changeLanguage(nextLang); onClose() },
    },
  ]

  const records: Entry[] = useMemo(() => [
    ...orders.map(o => ({ key: `order:${o.id}`, group: t('jumpTo.orders'), label: o.id, hint: o.company ?? undefined, icon: ShoppingBag, text: `${o.id} ${o.company ?? ''} ${o.po_number ?? ''}`.toLowerCase(), run: go(`/orders/${encodeURIComponent(o.id)}`) })),
    ...invoices.map(i => ({ key: `invoice:${i.id}`, group: t('jumpTo.invoices'), label: i.id, hint: `${i.kepada_yth}${i.type === 'dp' ? ' · DP' : i.type === 'pelunasan' ? ' · Pelunasan' : ''}`, icon: FileText, text: `${i.id} ${i.kepada_yth} ${i.order_id} ${i.type}`.toLowerCase(), run: go(`/invoice/${encodeURIComponent(i.id)}`) })),
    ...clients.map(c => ({ key: `client:${c.id}`, group: t('jumpTo.clients'), label: c.client_name, hint: c.address ?? undefined, icon: Building2, text: `${c.client_name} ${c.address ?? ''}`.toLowerCase(), run: go(`/clients/${c.id}`) })),
    ...deliveries.map(d => ({ key: `delivery:${d.id}`, group: t('jumpTo.deliveries'), label: d.id, hint: d.company ?? undefined, icon: Truck, text: `${d.id} ${d.company ?? ''} ${d.type}`.toLowerCase(), run: go(`/delivery/${encodeURIComponent(d.id)}`) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [orders, invoices, clients, deliveries, t])

  // Every word typed must appear; records come after pages and actions, a
  // few per kind, newest first (they're listed newest first already).
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (e: Entry) => words.every(w => e.text.includes(w))
  const shown: Entry[] = words.length === 0
    ? [...pages, ...actions]
    : (() => {
      const out = [...pages, ...actions].filter(matches)
      const perGroup = new Map<string, number>()
      for (const r of records) {
        if (!matches(r)) continue
        const n = perGroup.get(r.group) ?? 0
        if (n >= RECORDS_PER_GROUP) continue
        perGroup.set(r.group, n + 1)
        out.push(r)
      }
      return out
    })()

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (shown.length ? (a + 1) % shown.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (shown.length ? (a - 1 + shown.length) % shown.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); shown[active]?.run() }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-navy-950/40 backdrop-blur-sm fade-in"
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('jumpTo.title')} tabIndex={-1}
        className="w-full max-w-xl bg-white rounded-2xl shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] overflow-hidden outline-none dark:bg-navy-900 dark:ring-1 dark:ring-navy-700">
        <div className="flex items-center gap-3 px-4 border-b border-slate-100 dark:border-navy-800">
          <Search size={16} className="text-slate-400 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('jumpTo.placeholder')}
            aria-label={t('jumpTo.title')}
            aria-controls="jump-to-list"
            aria-activedescendant={shown[active] ? `jump-${active}` : undefined}
            className="flex-1 py-4 bg-transparent text-[15px] text-navy-900 placeholder:text-slate-400 outline-none dark:text-slate-50"
          />
          {/* Also a button: a phone has no Esc key. */}
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-400">
            <Kbd className="cursor-pointer">Esc</Kbd>
          </button>
        </div>
        <div ref={listRef} id="jump-to-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto py-2">
          {shown.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('jumpTo.nothing', { query: query.trim() })}</p>
          )}
          {shown.map((e, i) => {
            const heading = e.group !== lastGroup ? e.group : null
            lastGroup = e.group
            const Icon = e.icon
            return (
              <div key={e.key}>
                {heading && <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{heading}</p>}
                <div
                  id={`jump-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={e.run}
                  className={`mx-2 flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${i === active ? 'bg-slate-100 dark:bg-white/[0.07]' : ''}`}
                >
                  <Icon size={15} className={i === active ? 'text-navy-700 dark:text-gold-400' : 'text-slate-400'} aria-hidden />
                  <span className="text-sm text-navy-900 truncate dark:text-slate-100">{e.label}</span>
                  {e.hint && <span className="text-xs text-slate-500 truncate dark:text-slate-400">{e.hint}</span>}
                  {i === active && <CornerDownLeft size={13} className="ml-auto shrink-0 text-slate-400" aria-hidden />}
                </div>
              </div>
            )
          })}
          {words.length === 0 && (
            <p className="px-4 pt-2 pb-1 text-xs text-slate-500 dark:text-slate-400">{t('jumpTo.typeToFind')}</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 dark:border-navy-800 dark:text-slate-400">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('jumpTo.move')}</span>
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd> {t('jumpTo.open')}</span>
        </div>
      </div>
    </div>
  )
}
