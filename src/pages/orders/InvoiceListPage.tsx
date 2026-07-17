import { useState } from 'react'
import { FileText, Eye, Receipt } from 'lucide-react'
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
  const update = invoiceHooks.useUpdate()
  const navigate = useNavigate()

  // Defaults to Unpaid — that's the actionable view (this is the AR
  // Receivable list, effectively); "All" and "Paid" are one click away.
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'paid' | 'all'>('unpaid')
  const filteredData = data?.filter(inv => statusFilter === 'all' || inv.status === statusFilter)

  const toggleStatus = (row: Invoice) => {
    const nextStatus = row.status === 'paid' ? 'unpaid' : 'paid'
    // Stamp paid_date the first time an invoice is marked paid, so there's
    // a record of when that happened. Going back to unpaid deliberately
    // leaves paid_date alone rather than clearing it — reverting a status
    // flip shouldn't erase the history of when it WAS marked paid.
    const body = nextStatus === 'paid' && !row.paid_date
      ? { status: nextStatus, paid_date: new Date().toISOString() }
      : { status: nextStatus }
    update.mutate({ id: row.id, body })
  }

  return (
    <CrudPage<Invoice>
      title="Invoices"
      icon={FileText}
      data={filteredData}
      isLoading={isLoading}
      searchKeys={['id', 'kepada_yth', 'order_id']}
      filterBar={
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['unpaid', 'paid', 'all'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === f ? 'bg-white shadow-sm text-navy-900' : 'text-slate-500 hover:text-navy-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      }
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
        { header: 'Amount Due',   key: 'total',
          render: r => {
            const due = r.type === 'dp' ? (r.down_payment ?? 0) : r.remaining
            return (
              <div>
                <span className="font-mono">{formatRp(due)}</span>
                <div className="text-[10px] text-slate-400">of {formatRp(r.total)} total</div>
              </div>
            )
          }},
        { header: 'Date',         key: 'tanggal',
          render: r => r.tanggal ? format(new Date(r.tanggal), 'dd MMM yyyy') : '—' },
        { header: 'Status',       key: 'status',
          render: r => (
            <button
              type="button"
              className={`badge ${STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-600'} cursor-pointer hover:opacity-75 transition-opacity inline-block w-16 text-center`}
              onClick={() => toggleStatus(r)}
              disabled={update.isPending}
              title={r.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
            >
              {r.status === 'paid' ? 'Paid' : 'Unpaid'}
            </button>
          )},
      ]}
      formTitle={() => ''}
      renderForm={() => null}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => `Delete invoice ${r.id}?`}
      // Invoices aren't created/edited through this generic modal — they're
      // generated from an order's item list (OrderDetailPage), since the
      // total/items context lives there. The pencil takes you straight to
      // that order with the right (DP or Pelunasan) form already open;
      // Add New sends you to Orders to pick which order to invoice.
      onEditClick={row => navigate(`/orders/${encodeURIComponent(row.order_id)}`, {
        state: { openInvoiceType: row.type },
      })}
      onAddClick={() => navigate('/orders')}
      rowActions={row => (
        <>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/invoice/${encodeURIComponent(row.id)}`)}
            title="View invoice"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/invoice/${encodeURIComponent(row.id)}/kwitansi`)}
            title="Print kwitansi/receipt"
          >
            <Receipt className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    />
  )
}