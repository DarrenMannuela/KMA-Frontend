import { useSearchParams } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { Ledger } from '@/components/finance/Ledger'
import { filtersFromParams } from '@/components/finance/ledgerParams'

/** Every operation line, opened on this month (or what the link asks for). */
export function OperationsPage() {
  const [params] = useSearchParams()
  return (
    <Ledger
      key={params.toString()}
      kind="operation"
      title="Operations"
      icon={Wrench}
      initial={filtersFromParams(params)}
    />
  )
}
