import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PiggyBank } from 'lucide-react'
import { formatRp } from '@/components/ui'
import { productionHooks, operationHooks, supplierHooks } from '@/hooks'
import { formatDateShort } from '@/utils/MonthUtils'
import { fromProduction, fromOperation, supplierLabel } from './ledgerModel'
import { sheetParams } from './ledgerParams'

/** The Kas Bon lines linked to an order, and what the order made after them. */
export function OrderCosts({ orderId, value }: { orderId: string; value: number }) {
  const navigate = useNavigate()
  const production = productionHooks.useList()
  const operations = operationHooks.useList()
  const { data: suppliers = [] } = supplierHooks.useList()
  const lines = useMemo(() => [
    ...production.data.filter(r => r.order_id === orderId).map(fromProduction),
    ...operations.data.filter(r => r.order_id === orderId).map(fromOperation),
  ].sort((a, b) => a.date.localeCompare(b.date)), [production.data, operations.data, orderId])
  const costs = lines.reduce((n, l) => n + l.total, 0)
  const profit = value - costs
  const open = (kind: 'production' | 'operations') =>
    navigate(`/${kind}?${new URLSearchParams(sheetParams({ order: orderId, period: 'all' })).toString()}`)

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <PiggyBank size={16} className="text-navy-500" />
        <h3 className="font-semibold text-navy-900 text-sm">Costs & margin</h3>
        <span className="ml-auto flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => open('production')}>Bahan lines</button>
          <button className="btn-ghost btn-sm" onClick={() => open('operations')}>Operation lines</button>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div><div className="text-xs text-slate-400">Order value</div><div className="font-mono text-navy-900">{formatRp(value)}</div></div>
        <div><div className="text-xs text-slate-400">Linked costs</div><div className="font-mono text-slate-700">{formatRp(costs)}</div></div>
        <div>
          <div className="text-xs text-slate-400">Profit</div>
          <div className={`font-mono font-semibold ${profit < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {formatRp(profit)} {value > 0 && <span className="text-xs font-normal text-slate-400">{Math.round((profit / value) * 100)}%</span>}
          </div>
        </div>
      </div>
      {lines.length ? (
        <ul className="divide-y divide-slate-50 text-sm">
          {lines.map(l => (
            <li key={`${l.kind}${l.id}`} className="flex items-center gap-3 py-1.5">
              <span className="font-mono text-xs text-slate-400 w-16">{l.header_id}</span>
              <span className="flex-1 truncate text-slate-700">
                {l.name || l.category}
                <span className="text-xs text-slate-400"> · {l.kind === 'production' ? `${supplierLabel(suppliers, l.supplier_id)} · ${l.qty.toLocaleString('id-ID')} ${l.unit}` : l.category} · {formatDateShort(l.date)}</span>
              </span>
              <span className="font-mono tabular-nums">{formatRp(l.total)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">
          No Kas Bon lines are linked to this order yet. In Production or Operations, fill the Order column of a line
          (or select lines and use Order) to see what this order really cost.
        </p>
      )}
    </div>
  )
}
