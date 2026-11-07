import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams } from '@/components/finance/ledgerParams'

/** Every production line, opened on this month (or what the link asks for). */
export function ProductionPage() {
  const [params] = useSearchParams()
  const { t } = useTranslation()
  return (
    <Ledger
      key={params.toString()}
      kind="production"
      title={t('common.production')}
      initial={filtersFromParams(params)}
    />
  )
}
