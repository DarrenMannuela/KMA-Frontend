import { useMemo, useState } from 'react'
import { PiggyBank } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader, ErrorState, LoadingState } from '@/components/ui/Page'
import { productionHooks, operationHooks } from '@/hooks'
import { BudgetPanel, RecurringPanel } from '@/components/finance/BudgetPanels'
import { PeriodPicker, currentPeriod } from '@/components/finance/PeriodPicker'
import { fromOperation, fromProduction, type Period } from '@/components/finance/ledgerModel'

/** Monthly budgets against what was spent, and the costs that repeat each month. */
export function BudgetsPage() {
  const { t } = useTranslation()
  const production = productionHooks.useList()
  const operations = operationHooks.useList()
  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'))
  const costs = useMemo(() => [...production.data.map(fromProduction), ...operations.data.map(fromOperation)], [production.data, operations.data])
  const categories = useMemo(() => [...new Set(operations.data.map(r => r.category).filter(Boolean))].sort(), [operations.data])

  return (
    <div className="p-4 md:p-6 max-w-[1200px]">
      <PageHeader
        icon={PiggyBank}
        title={t('finance.budgets.title')}
        subtitle={t('finance.budgets.subtitle')}
        actions={<PeriodPicker value={period} onChange={setPeriod} modes={['month']} />}
      />
      {production.isLoading || operations.isLoading ? (
        <LoadingState />
      ) : production.isError || operations.isError ? (
        <div className="card"><ErrorState what={t('finance.budgets.errorWhat')} onRetry={() => { production.refetch(); operations.refetch() }} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <BudgetPanel year={period.year} month={period.month} costs={costs} categories={categories} />
          <RecurringPanel categories={categories} />
        </div>
      )}
    </div>
  )
}
