import { useSearchParams } from 'react-router-dom'
import { Factory } from 'lucide-react'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams } from '@/components/finance/ledgerParams'

/** Every production line, opened on this month (or what the link asks for). */
export function ProductionPage() {
  const [params] = useSearchParams()
  return (
    <Ledger
      key={params.toString()}
      kind="production"
      title="Production"
      icon={Factory}
      initial={filtersFromParams(params)}
    />
  )
}
