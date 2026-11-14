import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format, differenceInCalendarDays } from 'date-fns'
import { Check } from 'lucide-react'
import { deliveryHooks, productionHooks, operationHooks, useOrderRemainingItems } from '@/hooks'
import { useDateLocale } from '@/i18n/dateLocale'
import { sheetParams } from '@/components/finance/ledgerParams'
import { isPastDue } from '@/utils/orderStatus'
import type { Invoice } from '@/types'

type StepState = 'done' | 'now' | 'late' | 'todo'
interface Step {
  key: string
  label: string
  state: StepState
  detail: React.ReactNode
  /** What to do when this is the step being waited on. */
  next: string
}

/** Where an order stands, start to finish: ordered → DP → production →
 *  delivered → Pelunasan. Without a DP there's no DP step: an order not
 *  invoiced yet, or billed in one go (COD), ends in Payment, and one with
 *  only a Pelunasan invoice ends in Pelunasan. Read from what's already recorded: its invoices, the Kas Bon
 *  lines linked to it, and its DO / Surat Jalan. Each step names its
 *  document and links to it; the header says what comes next. */
export function OrderJourney({ orderId, orderDate, itemCount, dpInvoice, pelunasanInvoice, cancelledAt = null }: {
  /** When the order was cancelled, if it was: the journey stops where it got to. */
  cancelledAt?: string | null
  orderId: string
  orderDate: string | null | undefined
  itemCount: number
  dpInvoice: Invoice | null
  pelunasanInvoice: Invoice | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dateLocale = useDateLocale()
  const { data: allDeliveries = [] } = deliveryHooks.useList()
  const production = productionHooks.useList()
  const operations = operationHooks.useList()

  const deliveries = useMemo(
    () => allDeliveries.filter(d => d.order_id === orderId).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [allDeliveries, orderId],
  )
  // How much of the order has shipped, from what its DO / SJ boxes hold.
  const remaining = useOrderRemainingItems(orderId)
  const ordered = remaining.reduce((n, r) => n + r.amount, 0)
  const shipped = remaining.reduce((n, r) => n + Math.min(r.amount, r.delivered), 0)
  const kasBonLines = useMemo(
    () => production.data.filter(r => r.order_id === orderId).length + operations.data.filter(r => r.order_id === orderId).length,
    [production.data, operations.data, orderId],
  )

  const day = (d: string | null | undefined) => (d ? format(new Date(d), 'dd MMM', { locale: dateLocale }) : '')
  const link = (text: string, to: string) => (
    <button type="button" className="py-1 font-medium text-navy-600 hover:underline dark:text-navy-200" onClick={() => navigate(to)}>{text}</button>
  )
  const invoiceLink = (inv: Invoice) => link(inv.id, `/invoice/${encodeURIComponent(inv.id)}`)

  // One invoice as a step: not made yet, waiting, late, or paid.
  const invoiceStep = (key: string, label: string, inv: Invoice | null, next: { make: string; wait: string; chase: string }): Step => {
    if (!inv) return { key, label, state: 'todo', detail: t('orderJourney.notInvoiced'), next: next.make }
    if (inv.status === 'cancelled') return { key, label, state: 'todo', detail: <>{invoiceLink(inv)} · {t('orderJourney.invoiceCancelled')}</>, next: '' }
    if (inv.status === 'paid') {
      return { key, label, state: 'done', detail: <>{invoiceLink(inv)}{inv.paid_date && <> · {t('orderJourney.paid', { date: day(inv.paid_date) })}</>}</>, next: '' }
    }
    if (isPastDue(inv)) {
      const days = differenceInCalendarDays(new Date(), new Date(inv.due_date!))
      return { key, label, state: 'late', detail: <>{invoiceLink(inv)} · <span className="font-medium text-red-600 dark:text-red-400">{t('orderJourney.overdue', { count: days })}</span></>, next: next.chase }
    }
    return { key, label, state: 'now', detail: <>{invoiceLink(inv)} · {inv.due_date ? t('orderJourney.due', { date: day(inv.due_date) }) : t('orderJourney.unpaid')}</>, next: next.wait }
  }

  const fullInvoice = !!dpInvoice && (dpInvoice.down_payment ?? 0) === 0
  const hasDp = !!dpInvoice && !fullInvoice
  const delivered = deliveries.length > 0
  // Some shipped, some not: delivery is under way, not done. (With nothing
  // packed in any box yet, there's no way to tell, so a DO counts as done.)
  const partial = delivered && shipped > 0 && shipped < ordered
  const steps: Step[] = [
    // An order with nothing on it yet isn't finished being entered.
    { key: 'order', label: t('orderJourney.steps.order'), state: itemCount ? 'done' : 'now', detail: <>{day(orderDate)}{orderDate ? ' · ' : ''}{itemCount ? t('orderJourney.items', { count: itemCount }) : t('orderJourney.noItems')}</>, next: t('orderJourney.next.addItems') },
    // A DP step only once the order has a DP invoice: before any invoice
    // it isn't known whether it'll be DP or paid in one go (COD), and an
    // order billed with a Pelunasan alone never had one.
    ...(!hasDp ? [] : [invoiceStep('dp', 'DP', dpInvoice, { make: t('orderJourney.next.makeDp'), wait: t('orderJourney.next.waitDp'), chase: t('orderJourney.next.chaseDp') })]),
    {
      key: 'production',
      label: t('orderJourney.steps.production'),
      // Shipped goods were made, whether or not their Kas Bon lines are linked.
      state: delivered ? 'done' : kasBonLines ? 'now' : 'todo',
      detail: kasBonLines
        ? link(t('orderJourney.kasBon', { count: kasBonLines }), `/production?${new URLSearchParams(sheetParams({ order: orderId, period: 'all' })).toString()}`)
        : t('orderJourney.noKasBon'),
      next: kasBonLines ? t('orderJourney.next.ship') : t('orderJourney.next.recordProduction'),
    },
    {
      key: 'delivery',
      label: t('orderJourney.steps.delivery'),
      state: partial ? 'now' : delivered ? 'done' : 'todo',
      detail: delivered
        ? <>{partial && <>{t('orderJourney.partial', { shipped, ordered })} · </>}{link(deliveries[0].id, `/delivery/${encodeURIComponent(deliveries[0].id)}`)} · {day(deliveries[0].date)}{deliveries.length > 1 && <> · {t('orderJourney.more', { count: deliveries.length - 1 })}</>}</>
        : t('orderJourney.noDelivery'),
      next: partial ? t('orderJourney.next.shipRest', { count: ordered - shipped }) : t('orderJourney.next.makeDelivery'),
    },
    fullInvoice || (!dpInvoice && !pelunasanInvoice)
      ? invoiceStep('payment', t('orderJourney.steps.payment'), dpInvoice, { make: t('orderJourney.next.makeInvoice'), wait: t('orderJourney.next.waitPayment'), chase: t('orderJourney.next.chasePayment') })
      : invoiceStep('pelunasan', 'Pelunasan', pelunasanInvoice, { make: t('orderJourney.next.makePelunasan'), wait: t('orderJourney.next.waitPayment'), chase: t('orderJourney.next.chasePayment') }),
  ]
  // The first step not done yet is the one in hand.
  // A cancelled order stopped where it was: nothing is in hand any more.
  if (cancelledAt) for (const s of steps) if (s.state !== 'done') s.state = 'todo'
  const currentIndex = cancelledAt ? -1 : steps.findIndex(s => s.state !== 'done')
  const current = currentIndex < 0 ? null : steps[currentIndex]
  if (current && current.state === 'todo') current.state = 'now'

  const dot: Record<StepState, string> = {
    done: 'bg-green-600 border-green-600 text-white dark:bg-green-500 dark:border-green-500',
    now: 'bg-white border-gold-500 dark:bg-navy-900',
    late: 'bg-white border-red-500 dark:bg-navy-900',
    todo: 'bg-white border-slate-300 dark:bg-navy-900 dark:border-navy-600',
  }

  return (
    <section className="card p-5" aria-label={t('orderJourney.title')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 className="font-semibold text-navy-900 dark:text-slate-50">{t('orderJourney.title')}</h2>
        <p className={`text-sm ${current?.state === 'late' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {cancelledAt ? t('orderJourney.cancelled', { date: format(new Date(cancelledAt), 'd MMM yyyy', { locale: dateLocale }) })
            : current ? t('orderJourney.nextStep', { step: current.next }) : t('orderJourney.allDone')}
        </p>
      </div>
      {/* A row of steps from dock up; a vertical list on a phone. */}
      <ol className="grid dock:grid-flow-col dock:auto-cols-fr">
        {steps.map((s, i) => {
          const last = i === steps.length - 1
          // The line to the next step is green once this one is done.
          const line = s.state === 'done' ? 'bg-green-600 dark:bg-green-500' : 'bg-slate-200 dark:bg-navy-700'
          return (
            <li key={s.key} aria-current={i === currentIndex ? 'step' : undefined}
              className="relative pl-8 pb-4 last:pb-0 dock:pl-0 dock:pb-0 dock:pt-7 dock:pr-4">
              {!last && <span aria-hidden className={`absolute left-[7px] top-4 bottom-0 w-0.5 dock:left-4 dock:right-0 dock:top-[7px] dock:bottom-auto dock:w-auto dock:h-0.5 ${line}`} />}
              <span aria-hidden className={`absolute left-0 top-0.5 dock:top-0 w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${dot[s.state]}`}>
                {s.state === 'done' && <Check size={9} strokeWidth={4} />}
              </span>
              <div className="text-sm font-semibold text-navy-900 dark:text-slate-50">
                {s.label}
                <span className="sr-only"> · {t(`orderJourney.state.${s.state}`)}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{s.detail}</div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
