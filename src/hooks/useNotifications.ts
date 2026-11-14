import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useDateLocale } from '@/i18n/dateLocale'
import { orderHooks, itemHooks, invoiceHooks, billable, clientHooks, productionHooks, operationHooks, useBudgets, useRecurringCosts } from '@/hooks'
import { receivables, budgetUsage, monthKey, dueOn } from '@/components/finance/financeStats'
import { fromProduction, fromOperation } from '@/components/finance/ledgerModel'
import { invoiceAmount } from '@/utils/invoiceAmount'
import { formatRp } from '@/components/ui'
import type { Invoice } from '@/types'

/** What needs attention, worked out from data the app already has — no
 *  server of its own. Each has an id for the situation it's about (an
 *  invoice being overdue, a budget passing 80% or 100% this month…), so
 *  reading it hides it from the count until something new happens. */
export interface AppNotification {
  id: string
  kind: 'overdue' | 'dueSoon' | 'notInvoiced' | 'budget' | 'recurring'
  tone: 'danger' | 'warning' | 'info'
  title: string
  detail: string
  href: string
}

/** An order with items and no invoice after this many days gets a nudge. */
const NOT_INVOICED_AFTER_DAYS = 3
/** An unpaid invoice due within this many days is "due soon". */
const DUE_SOON_DAYS = 3

const READ_KEY = 'kma-notifications-read'
const loadRead = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
const saveRead = (ids: Set<string>) => {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...ids])) } catch { /* storage blocked: read state lasts until reload */ }
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBetween = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)

export function useNotifications() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const { data: orders = [], isSuccess: ordersReady } = orderHooks.useList()
  const { data: items = [] } = itemHooks.useList()
  const { data: invoicesRaw = [], isSuccess: invoicesReady } = invoiceHooks.useList()
  const { data: clients = [] } = clientHooks.useList()
  const { data: production = [] } = productionHooks.useList()
  const { data: operations = [] } = operationHooks.useList()
  const { data: budgets = [] } = useBudgets()
  const { data: recurring = [] } = useRecurringCosts()
  const [read, setRead] = useState<Set<string>>(loadRead)

  const list = useMemo<AppNotification[]>(() => {
    const invoices = billable(invoicesRaw as Invoice[])
    const now = new Date()
    const today = isoDay(now)
    const thisMonth = monthKey(now.getFullYear(), now.getMonth())
    const monthName = format(now, 'MMMM', { locale: dateLocale })
    const out: AppNotification[] = []

    // Overdue invoices, most overdue first.
    for (const r of receivables(invoices, orders, clients, now)) {
      if (r.daysLate <= 0) continue
      out.push({
        id: `inv-overdue:${r.invoice.id}`, kind: 'overdue', tone: 'danger',
        title: t('notifications.overdue', { id: r.invoice.id, count: r.daysLate }),
        detail: `${r.client} · ${formatRp(r.amount)}`,
        href: `/invoice/${encodeURIComponent(r.invoice.id)}`,
      })
    }
    // Due within a few days.
    for (const inv of invoices) {
      if (inv.status === 'paid') continue
      const due = dueOn(inv)
      if (!due || due < today) continue
      const days = daysBetween(today, due)
      if (days > DUE_SOON_DAYS) continue
      out.push({
        id: `inv-due:${inv.id}`, kind: 'dueSoon', tone: 'warning',
        title: days === 0 ? t('notifications.dueToday', { id: inv.id }) : t('notifications.dueSoon', { id: inv.id, count: days }),
        detail: `${inv.kepada_yth} · ${formatRp(invoiceAmount(inv, invoices))}`,
        href: `/invoice/${encodeURIComponent(inv.id)}`,
      })
    }
    // Orders with items but no invoice yet.
    const withItems = new Set(items.map(i => i.order_id))
    for (const o of orders) {
      if (!withItems.has(o.id) || !o.date) continue
      const age = daysBetween(o.date.slice(0, 10), today)
      if (age < NOT_INVOICED_AFTER_DAYS) continue
      if (invoices.some(i => i.order_id === o.id)) continue
      out.push({
        id: `order-uninvoiced:${o.id}`, kind: 'notInvoiced', tone: 'info',
        title: t('notifications.notInvoiced', { id: o.id, count: age }),
        detail: o.company ?? '',
        href: `/orders/${encodeURIComponent(o.id)}`,
      })
    }
    // Budgets past 80% or 100% this month.
    const costs = [...production.map(fromProduction), ...operations.map(fromOperation)]
    for (const u of budgetUsage(budgets, costs, thisMonth)) {
      if (u.share < 0.8) continue
      const over = u.share > 1
      const label = u.budget.category || (u.budget.scope === 'production' ? t('finance.budgets.allProduction') : t('finance.budgets.allOperations'))
      out.push({
        id: `budget:${thisMonth}:${u.budget.scope}:${u.budget.category}:${over ? 'over' : '80'}`, kind: 'budget', tone: over ? 'danger' : 'warning',
        title: over ? t('notifications.budgetOver', { label }) : t('notifications.budgetNear', { label, percent: Math.round(u.share * 100) }),
        detail: t('notifications.budgetDetail', { spent: formatRp(u.spent), budget: formatRp(u.budget.amount) }),
        href: '/finance/budgets',
      })
    }
    // Recurring costs not yet posted this month.
    const due = recurring.filter(c => c.active && (!c.last_posted || c.last_posted < thisMonth))
    if (due.length) {
      out.push({
        id: `recurring:${thisMonth}`, kind: 'recurring', tone: 'info',
        title: t('notifications.recurring', { count: due.length, month: monthName }),
        detail: formatRp(due.reduce((n, c) => n + c.price, 0)),
        href: '/finance/budgets',
      })
    }
    return out
  }, [invoicesRaw, orders, clients, items, production, operations, budgets, recurring, t, dateLocale])

  const unread = list.filter(n => !read.has(n.id))
  const markRead = useCallback((ids: string[]) => {
    setRead(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      // Forget ids for situations that are over (paid, posted…), once the
      // data is in, so the stored list doesn't grow forever.
      if (ordersReady && invoicesReady) {
        const live = new Set(list.map(n => n.id))
        for (const id of next) if (!live.has(id)) next.delete(id)
      }
      saveRead(next)
      return next
    })
  }, [list, ordersReady, invoicesReady])

  return { list, unread, isRead: (id: string) => read.has(id), markRead }
}
