import { useMemo, useState } from 'react'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatRp } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import {
  useBudgets, useSetBudget, useRecurringCosts, useSaveRecurringCost, useDeleteRecurringCost, usePostRecurringMonth, useFinanceHeaders,
} from '@/hooks'
import { suggestNextKasBonId } from '@/utils/KasBonId'
import { monthLabel } from '@/utils/MonthUtils'
import type { RecurringCost } from '@/types'
import { Meter } from './FinanceCharts'
import { budgetUsage, monthKey } from './financeStats'
import type { LedgerRow } from './ledgerModel'


/** This month's spending against the budgets set for it. */
export function BudgetPanel({ year, month, costs, categories }: { year: number; month: number; costs: LedgerRow[]; categories: string[] }) {
  const { t } = useTranslation()
  const { data: budgets = [] } = useBudgets()
  const [editing, setEditing] = useState(false)
  const lines = useMemo(() => budgetUsage(budgets, costs, monthKey(year, month)).map(u => ({ b: u.budget, label: u.label, spent: u.spent })), [budgets, costs, year, month])

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-navy-900 text-sm">{t('finance.budgets.budgetsHeading', { month: monthLabel(year, month) })}</h3>
        <button className="ml-auto btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil size={13} /> {t('finance.budgets.setBudgets')}</button>
      </div>
      {!lines.length ? (
        <p className="py-6 text-center text-sm text-slate-400">{t('finance.budgets.noBudgetsYet')}</p>
      ) : (
        <ul className="space-y-3">
          {lines.map(({ b, label, spent: s }) => (
            <li key={b.id}>
              <div className="flex items-baseline gap-2 text-sm mb-1">
                <span className={b.category ? 'text-slate-700' : 'font-medium text-navy-900'}>{label}</span>
                <span className="ml-auto font-mono tabular-nums text-xs text-slate-500">{formatRp(s)} / {formatRp(b.amount)}</span>
                <span className={`w-10 text-right text-xs tabular-nums ${s > b.amount ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{Math.round((s / b.amount) * 100)}%</span>
              </div>
              <Meter value={s} max={b.amount} />
            </li>
          ))}
        </ul>
      )}
      {editing && <BudgetEditor categories={categories} onClose={() => setEditing(false)} />}
    </div>
  )
}

function BudgetEditor({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: budgets = [] } = useBudgets()
  const setBudget = useSetBudget()
  const rows = [
    { scope: 'production' as const, category: '', label: t('finance.budgets.allProduction') },
    { scope: 'operation' as const, category: '', label: t('finance.budgets.allOperations') },
    ...[...new Set([...categories, ...budgets.filter(b => b.scope === 'operation' && b.category).map(b => b.category)])].sort()
      .map(c => ({ scope: 'operation' as const, category: c, label: c })),
  ]
  const current = (scope: string, category: string) => budgets.find(b => b.scope === scope && b.category === category)?.amount ?? 0
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map(r => [`${r.scope}|${r.category}`, current(r.scope, r.category) ? String(current(r.scope, r.category)) : ''])))
  const [newCategory, setNewCategory] = useState('')

  const save = async () => {
    for (const r of rows) {
      const amount = Number(values[`${r.scope}|${r.category}`] || 0)
      if (amount !== current(r.scope, r.category)) await setBudget.mutateAsync({ scope: r.scope, category: r.category, amount })
    }
    if (newCategory.trim() && Number(values.__new || 0) > 0) {
      await setBudget.mutateAsync({ scope: 'operation', category: newCategory.trim().toUpperCase(), amount: Number(values.__new) })
    }
    onClose()
  }

  return (
    <Modal title={t('finance.budgets.modalTitle')} onClose={onClose}>
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{t('finance.budgets.modalHint')}</p>
        {rows.map(r => {
          const k = `${r.scope}|${r.category}`
          return (
            <label key={k} className="flex items-center gap-3">
              <span className={`flex-1 text-sm ${r.category ? 'text-slate-600 pl-3' : 'font-medium text-navy-900'}`}>{r.label}</span>
              <input className="field !w-40 text-right font-mono" inputMode="numeric" placeholder="—"
                value={values[k] ? Number(values[k]).toLocaleString('id-ID') : ''}
                onChange={e => setValues(v => ({ ...v, [k]: e.target.value.replace(/\D/g, '') }))} />
            </label>
          )
        })}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <input className="field flex-1" placeholder={t('finance.budgets.anotherCategoryPlaceholder')} value={newCategory} onChange={e => setNewCategory(e.target.value.toUpperCase())} />
          <input className="field !w-40 text-right font-mono" inputMode="numeric" placeholder="—"
            value={values.__new ? Number(values.__new).toLocaleString('id-ID') : ''}
            onChange={e => setValues(v => ({ ...v, __new: e.target.value.replace(/\D/g, '') }))} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={setBudget.isPending}>{t('finance.budgets.saveBudgets')}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Costs that come back every month, and a button to add this month's. */
export function RecurringPanel({ categories }: { categories: string[] }) {
  const { t } = useTranslation()
  const { data: costs = [] } = useRecurringCosts()
  const { data: headers = [] } = useFinanceHeaders()
  const save = useSaveRecurringCost()
  const remove = useDeleteRecurringCost()
  const post = usePostRecurringMonth()
  const [editing, setEditing] = useState<Partial<RecurringCost> | null>(null)

  const now = new Date()
  const key = monthKey(now.getFullYear(), now.getMonth())
  const due = costs.filter(c => c.active && (!c.last_posted || c.last_posted < key))
  const dueTotal = due.reduce((n, c) => n + c.price, 0)
  const monthlyTotal = costs.filter(c => c.active).reduce((n, c) => n + c.price, 0)

  const postMonth = () => post.mutate({
    month: key,
    header_id: suggestNextKasBonId(headers, now.getFullYear()),
    date: `${key}-${String(now.getDate()).padStart(2, '0')}`,
  })

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Repeat size={15} className="text-navy-500" />
        <h3 className="font-semibold text-navy-900 text-sm">{t('finance.budgets.recurringCosts')}</h3>
        <span className="text-xs text-slate-400">{t('finance.budgets.aMonth', { amount: formatRp(monthlyTotal) })}</span>
        <button className="ml-auto btn-ghost btn-sm" onClick={() => setEditing({ active: true, category: '', description: '', price: 0, last_posted: '' })}><Plus size={13} /> {t('finance.budgets.add')}</button>
      </div>
      {!costs.length ? (
        <p className="py-6 text-center text-sm text-slate-400">{t('finance.budgets.noRecurringYet')}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {costs.map(c => (
            <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
              <label className="inline-flex" title={c.active ? t('finance.budgets.active') : t('finance.budgets.paused')}>
                <input type="checkbox" checked={c.active} onChange={e => save.mutate({ ...c, active: e.target.checked })} />
              </label>
              <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(c)}>
                <span className={`block truncate ${c.active ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{c.description || c.category}</span>
                <span className="block text-xs text-slate-400">{c.category}{c.last_posted ? ` ${t('finance.budgets.lastAdded', { date: c.last_posted })}` : ''}</span>
              </button>
              <span className="font-mono tabular-nums text-slate-800">{formatRp(c.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {costs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {due.length ? (
            <button className="btn-primary btn-sm w-full justify-center" onClick={postMonth} disabled={post.isPending}>
              {t('finance.budgets.addMonthCosts', { month: monthLabel(now.getFullYear(), now.getMonth()), count: due.length, total: formatRp(dueTotal) })}
            </button>
          ) : (
            <p className="text-xs text-center text-green-700">{t('finance.budgets.allAddedFor', { month: monthLabel(now.getFullYear(), now.getMonth()) })}</p>
          )}
        </div>
      )}
      {editing && (
        <RecurringEditor value={editing} categories={categories}
          onSave={v => save.mutate(v as RecurringCost, { onSuccess: () => setEditing(null) })}
          onDelete={editing.id ? () => remove.mutate(editing.id!, { onSuccess: () => setEditing(null) }) : undefined}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function RecurringEditor({ value, categories, onSave, onDelete, onClose }: {
  value: Partial<RecurringCost>
  categories: string[]
  onSave: (v: Partial<RecurringCost>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [v, setV] = useState(value)
  const ok = !!v.category?.trim() && (v.price ?? 0) > 0
  return (
    <Modal title={value.id ? t('finance.budgets.editModalTitleEdit') : t('finance.budgets.editModalTitleNew')} onClose={onClose} size="sm">
      <div className="space-y-3">
        <label className="block"><span className="field-label">{t('finance.budgets.category')}</span>
          <input className="field" list="recurring-categories" value={v.category ?? ''} onChange={e => setV({ ...v, category: e.target.value.toUpperCase() })} placeholder={t('finance.budgets.categoryPlaceholder')} />
          <datalist id="recurring-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="block"><span className="field-label">{t('finance.budgets.description')}</span>
          <input className="field" value={v.description ?? ''} onChange={e => setV({ ...v, description: e.target.value.toUpperCase() })} placeholder={t('finance.budgets.descriptionPlaceholder')} />
        </label>
        <label className="block"><span className="field-label">{t('finance.budgets.amountEachMonth')}</span>
          <input className="field font-mono" inputMode="numeric" value={v.price ? v.price.toLocaleString('id-ID') : ''} onChange={e => setV({ ...v, price: Number(e.target.value.replace(/\D/g, '')) })} />
        </label>
        <div className="flex items-center gap-2 pt-1">
          {onDelete && <button className="btn-ghost text-red-600" onClick={onDelete}><Trash2 size={14} /> {t('common.delete')}</button>}
          <span className="flex-1" />
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={!ok} onClick={() => onSave(v)}>{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  )
}
