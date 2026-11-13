import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck, Clock, FileWarning, FilePlus2, Repeat, Scale, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useDialog } from '@/hooks/useDialog'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'

const ICONS: Record<AppNotification['kind'], LucideIcon> = {
  overdue: FileWarning,
  dueSoon: Clock,
  notInvoiced: FilePlus2,
  budget: Scale,
  recurring: Repeat,
}
const TONE: Record<AppNotification['tone'], string> = {
  danger: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  info: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300',
}
const ORDER: Record<AppNotification['tone'], number> = { danger: 0, warning: 1, info: 2 }

/** The bell in the top bar: what needs attention (overdue and due-soon
 *  invoices, orders not invoiced, budgets running out, recurring costs to
 *  post), with a count of the ones not read yet. A dropdown on a computer,
 *  a sheet from the bottom on a phone. Opening one goes to it and marks it
 *  read; read ones stay listed, dimmed, while the situation lasts. */
export function NotificationBell() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { list, unread, isRead, markRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Desktop dropdown: an outside click or Esc closes it.
  useEffect(() => {
    if (!open || isMobile) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open, isMobile])

  const sorted = [...list].sort((a, b) => Number(isRead(a.id)) - Number(isRead(b.id)) || ORDER[a.tone] - ORDER[b.tone])
  const go = (n: AppNotification) => { markRead([n.id]); setOpen(false); navigate(n.href) }
  const count = unread.length

  const panel = (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-navy-800">
        <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-50">{t('notifications.title')}</h2>
        {count > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{t('notifications.unreadCount', { count })}</span>}
        {count > 0 && (
          <button type="button" onClick={() => markRead(unread.map(n => n.id))}
            className="tap ml-auto inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800 dark:text-navy-300 dark:hover:text-slate-100">
            <CheckCheck size={14} aria-hidden /> {t('notifications.markAllRead')}
          </button>
        )}
        {isMobile && <button type="button" onClick={() => setOpen(false)} className={`btn-ghost !px-0 ${count > 0 ? '' : 'ml-auto'}`} aria-label={t('common.close')}><X size={18} /></button>}
      </div>
      {sorted.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <CheckCheck className="w-7 h-7 mx-auto text-green-600 dark:text-green-400" aria-hidden />
          <p className="mt-2 text-sm font-medium text-navy-900 dark:text-slate-50">{t('notifications.allClear')}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('notifications.allClearHint')}</p>
        </div>
      ) : (
        <ul className="py-1">
          {sorted.map(n => {
            const Icon = ICONS[n.kind]
            const seen = isRead(n.id)
            return (
              <li key={n.id}>
                <button type="button" onClick={() => go(n)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 outline-none dark:hover:bg-white/5 dark:focus-visible:bg-white/5 ${seen ? 'opacity-60' : ''}`}>
                  <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${TONE[n.tone]}`}><Icon size={16} aria-hidden /></span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm leading-snug text-navy-900 dark:text-slate-50 ${seen ? '' : 'font-medium'}`}>{n.title}</span>
                    {n.detail && <span className="block text-xs text-slate-500 truncate dark:text-slate-400">{n.detail}</span>}
                  </span>
                  {!seen && <span className="mt-2 w-2 h-2 shrink-0 rounded-full bg-navy-600 dark:bg-gold-400" aria-label={t('notifications.unread')} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={count ? t('notifications.bellLabelCount', { count }) : t('notifications.title')}
        title={t('notifications.title')}
        className="btn-ghost !px-2 relative"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-[1.05rem] text-center tabular-nums">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && !isMobile && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[24rem] max-h-[70vh] overflow-y-auto bg-white rounded-xl border border-slate-100 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] dark:bg-navy-900 dark:border-navy-800">
          {panel}
        </div>
      )}
      {open && isMobile && <NotificationSheet onClose={() => setOpen(false)}>{panel}</NotificationSheet>}
    </div>
  )
}

function NotificationSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t('notifications.title')} tabIndex={-1}
        className="w-full max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl slide-up outline-none pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-navy-900">
        {children}
      </div>
    </div>
  )
}
