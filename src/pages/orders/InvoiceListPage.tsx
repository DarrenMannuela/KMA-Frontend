import { FileText, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CrudPage } from '@/components/ui/CrudPage'
import { formatRp } from '@/components/ui'
import { invoiceHooks } from '@/hooks'
import type { Invoice } from '@/types'

const STATUS_BADGE: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-600',
  paid:   'bg-green-50 text-green-700',
}

const TYPE_BADGE: Record<string, string> = {
  dp:         'bg-blue-50 text-blue-700',
  pelunasan:  'bg-purple-50 text-purple-700',
}

export function InvoiceListPage() {
  const { data, isLoading } = invoiceHooks.useList()
  const del = invoiceHooks.useDelete()
  const navigate = useNavigate()

  return (
    <CrudPage<Invoice>
      title="Invoices"
      icon={FileText}
      data={data}
      isLoading={isLoading}
      searchKeys={['id', 'kepada_yth', 'order_id']}
      columns={[
        { header: 'Invoice No.',  key: 'id',
          render: r => <span className="id-chip font-mono">{r.id}</span> },
        { header: 'Order ID',     key: 'order_id',
          render: r => <span className="font-mono text-xs text-slate-500">{r.order_id}</span> },
        { header: 'Client',       key: 'kepada_yth',
          render: r => <span className="font-medium">{r.kepada_yth}</span> },
        { header: 'Type',         key: 'type',
          render: r => (
            <span className={`badge ${TYPE_BADGE[r.type] ?? 'bg-slate-100 text-slate-600'}`}>
              {r.type === 'dp' ? 'Down Payment' : 'Pelunasan'}
            </span>
          )},
        { header: 'Total',        key: 'total',
          render: r => <span className="font-mono">{formatRp(r.total)}</span> },
        { header: 'Date',         key: 'tanggal',
          render: r => r.tanggal ? format(new Date(r.tanggal), 'dd MMM yyyy') : '—' },
        { header: 'Status',       key: 'status',
          render: r => (
            <span className={`badge ${STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {r.status === 'paid' ? 'Paid' : 'Unpaid'}
            </span>
          )},
      ]}
      formTitle={() => ''}
      renderForm={() => null}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete invoice ${r.id}?`}
      rowActions={row => (
        <button
          className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
          onClick={() => navigate(`/invoice/${encodeURIComponent(row.id)}`)}
          title="View invoice"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
    />
  )
}