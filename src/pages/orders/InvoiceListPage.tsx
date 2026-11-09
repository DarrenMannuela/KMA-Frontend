import { invoiceAmount, isFullInvoice as isFull } from '@/utils/invoiceAmount'
import { useState } from 'react'
import { FileText, Eye, Receipt } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CrudPage } from '@/components/ui/CrudPage'
import { formatRp } from '@/components/ui'
import { invoiceHooks } from '@/hooks'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Invoice } from '@/types'
import { isPastDue } from '@/utils/orderStatus'

// Colour by meaning: unpaid is in progress (blue), red only once it's past
// its due date, paid is done (green).
const statusBadge = (r: Invoice) => r.status === 'paid' ? 'badge-green' : isPastDue(r) ? 'badge-red' : 'badge-blue'

const TYPE_BADGE: Record<string, string> = {
  dp:         'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  pelunasan:  'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
}

export function InvoiceListPage() {
  const { data, isLoading, isError, refetch } = invoiceHooks.useList()
  const del = invoiceHooks.useDelete()
  const update = invoiceHooks.useUpdate()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  // Defaults to Unpaid (the receivables). Kept in sessionStorage so it survives
  // opening an invoice and coming back.
  const [statusFilter, setStatusFilterState] = useState<'unpaid' | 'paid' | 'all'>(() => {
    try {
      const saved = sessionStorage.getItem('invoice-status-filter')
      if (saved === 'unpaid' || saved === 'paid' || saved === 'all') return saved
    } catch { /* ignore */ }
    return 'unpaid'
  })
  const setStatusFilter = (value: 'unpaid' | 'paid' | 'all') => {
    setStatusFilterState(value)
    try { sessionStorage.setItem('invoice-status-filter', value) } catch { /* private mode / quota — filter just won't persist */ }
  }
  const filteredData = data?.filter(inv => statusFilter === 'all' || inv.status === statusFilter)

  const toggleStatus = (row: Invoice) => {
    const nextStatus = row.status === 'paid' ? 'unpaid' : 'paid'
    // paid_date is stamped the first time an invoice is marked paid and kept if it
    // goes back to unpaid.
    const body = nextStatus === 'paid' && !row.paid_date
      ? { status: nextStatus, paid_date: new Date().toISOString() }
      : { status: nextStatus }
    update.mutate({ id: row.id, body }, {
      // Marking paid hides the row under the Unpaid filter, so the toast offers Undo.
      // It reverts directly: `row` still holds the old status.
      onSuccess: () => {
        if (nextStatus !== 'paid') return
        toast((toastItem) => (
          <span className="flex items-center gap-3">
            {t('invoiceList.markedPaid')}
            <button
              className="font-semibold text-navy-300 hover:text-white underline underline-offset-2"
              onClick={() => {
                toast.dismiss(toastItem.id)
                update.mutate({ id: row.id, body: { status: 'unpaid' } })
              }}
            >
              {t('common.undo')}
            </button>
          </span>
        ))
      },
    })
  }

  return (
    <CrudPage<Invoice>
      title={t('invoiceList.title')}
      icon={FileText}
      data={filteredData}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      searchKeys={['id', 'kepada_yth', 'order_id']}
      filterBar={
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 dark:bg-white/10">
          {(['unpaid', 'paid', 'all'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === f ? 'bg-white shadow-sm text-navy-900 dark:bg-navy-900 dark:text-slate-50' : 'text-slate-500 hover:text-navy-700 dark:text-slate-400'
              }`}
            >
              {t(`invoiceList.filters.${f}`)}
            </button>
          ))}
        </div>
      }
      columns={[
        { header: t('common.invoiceNo'), key: 'id',
          render: r => <span className="id-chip font-mono">{r.id}</span> },
        { header: t('common.orderId'), key: 'order_id',          secondary: true,
          render: r => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.order_id}</span> },
        { header: t('common.client'), key: 'kepada_yth',
          render: r => <span className="font-medium">{r.kepada_yth}</span> },
        { header: t('common.type'), key: 'type',              secondary: true,
          render: r => {
            const isFullInvoice = isFull(r)
            return (
              <span className={`badge ${TYPE_BADGE[r.type] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                {isFullInvoice ? t('invoiceList.fullInvoice') : r.type === 'dp' ? t('common.downPayment') : 'Pelunasan'}
              </span>
            )
          }},
        { header: t('dashboard.amountDue'), key: 'total',
          render: r => {
            // The unfiltered list, not filteredData: a Pelunasan's sibling DP
            // invoice may be 'paid' and hidden under the Unpaid filter, but
            // still needs to be found for the live amount (see invoiceAmount).
            const due = invoiceAmount(r, data)
            return (
              <div>
                <span className="font-mono">{formatRp(due)}</span>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">{t('invoiceList.ofTotal', { amount: formatRp(r.total) })}</div>
              </div>
            )
          }},
        { header: t('common.date'), key: 'tanggal',
          render: r => r.tanggal ? <span className="whitespace-nowrap">{format(new Date(r.tanggal), 'dd MMM yyyy', { locale: dateLocale })}</span> : '—' },
        { header: t('common.status'), key: 'status',
          render: r => (
            <button
              type="button"
              className={`badge ${statusBadge(r)} cursor-pointer hover:opacity-75 transition-opacity min-w-16 justify-center`}
              onClick={() => toggleStatus(r)}
              disabled={update.isPending}
              title={r.status === 'paid' ? t('invoiceList.markUnpaid') : t('invoiceList.markPaid')}
            >
              {r.status === 'paid' ? t('common.paid') : isPastDue(r) ? t('dashboardKpi.paymentStatus.overdue') : t('common.unpaid')}
            </button>
          )},
      ]}
      formTitle={() => ''}
      renderForm={() => null}
      onDelete={id => del.mutate(id)}
      deleteMessage={r => t('invoiceList.deleteConfirm', { id: r.id })}
      // Invoices are made and edited from their order; the pencil opens it with the
      // right form.
      onEditClick={row => navigate(`/orders/${encodeURIComponent(row.order_id)}`, {
        state: { openInvoiceType: row.type },
      })}
      onAddClick={() => navigate('/orders')}
      undoDeletes
      rowHref={row => `/invoice/${encodeURIComponent(row.id)}`}
      rowActions={row => (
        <>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/invoice/${encodeURIComponent(row.id)}`)}
            title={t('invoiceList.viewInvoice')} aria-label={t('invoiceList.viewInvoice')}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-ghost btn-sm !px-2 hover:!text-gold-500"
            onClick={() => navigate(`/invoice/${encodeURIComponent(row.id)}/kwitansi`)}
            title={t('invoiceList.printKwitansi')} aria-label={t('invoiceList.printKwitansi')}
          >
            <Receipt className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    />
  )
}