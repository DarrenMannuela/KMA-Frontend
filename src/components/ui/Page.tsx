import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** The top of every page: icon, title, a line under it, and the page's actions. */
export function PageHeader({ icon: Icon, title, subtitle, actions }: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5 fade-up">
      <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gold-400" />
      </div>
      <div className="min-w-0">
        <h2 className="font-display font-semibold text-navy-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-slate-400 text-xs truncate">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A white card, optionally with a title row (and actions on its right). */
export function Card({ title, icon: Icon, actions, children, className = '', bodyClassName = 'p-5' }: {
  title?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          {Icon && <Icon className="w-4 h-4 text-navy-500" />}
          {title && <h3 className="font-semibold text-navy-900 text-sm">{title}</h3>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 className="w-5 h-5 text-navy-400 animate-spin" /> {label ?? t('common.loading')}
    </div>
  )
}

/** A fetch that failed: says what, and offers to try again. */
export function ErrorState({ what, onRetry }: { what: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="w-9 h-9 mb-3 text-red-300" />
      <p className="font-medium text-slate-600 text-sm">{t('common.couldntLoad', { what })}</p>
      <p className="text-xs text-slate-400 mt-1 mb-4">{t('common.checkConnection')}</p>
      {onRetry && <button className="btn-secondary btn-sm" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  )
}
