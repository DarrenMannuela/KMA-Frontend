import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams } from '@/components/finance/ledgerParams'

/** Every operation line, opened on this month (or what the link asks for). */
export function OperationsPage() {
  const [params] = useSearchParams()
  const { t } = useTranslation()
  return (
    <Ledger
      key={params.toString()}
      kind="operation"
      title={t('common.operations')}
      initial={filtersFromParams(params)}
    />
  )
}
