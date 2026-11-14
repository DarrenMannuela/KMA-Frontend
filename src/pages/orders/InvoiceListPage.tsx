import { invoiceAmount, isFullInvoice as isFull } from '@/utils/invoiceAmount'
import { useState } from 'react'
import { FileText, Eye, Receipt } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CrudPage } from '@/components/ui/CrudPage'
import { formatRp } from '@/components/ui'
import { invoiceHooks, buktiKasHooks } from '@/hooks'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui'
import { todayISODate } from '@/utils/MonthUtils'
import { useDateLocale } from '@/i18n/dateLocale'
import type { Invoice } from '@/types'
import { isPastDue } from '@/utils/orderStatus'

// Colour by meaning: unpaid is in progress (blue), red only once it's past
// its due date, paid is done (green).
// An invoice cancelled with its order is struck off (grey), under All only.
const statusBadge = (r: Invoice) => r.status === 'cancelled' ? 'badge-slate line-through decoration-slate-400' : r.status === 'paid' ? 'badge-green' : isPastDue(r) ? 'badge-red' : 'badge-blue'

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

  const statusLabel = (r: Invoice) =>
    r.status === 'cancelled' ? t('dashboardKpi.paymentStatus.cancelled') : r.status === 'paid' ? t('common.paid') : isPastDue(r) ? t('dashboardKpi.paymentStatus.overdue') : t('common.unpaid')

  // Invoices paid by a Bukti Kas line: unpaid again only by unlinking it there.
  const { data: buktiKas = [] } = buktiKasHooks.useList()
  const paidByBuktiKas = (id: string) => buktiKas.find(b => b.invoice_id === id)?.header_id ?? null

  // Marking paid asks the date it was paid (today unless changed); marking
  // unpaid clears it, so a paid date always means paid.
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [payDate, setPayDate] = useState(todayISODate())
  const toggleStatus = (row: Invoice) => {
    if (row.status === 'paid') {
      update.mutate({ id: row.id, body: { status: 'unpaid', paid_date: null } })
      return
    }
    setPayDate(row.paid_date ? row.paid_date.slice(0, 10) : todayISODate())
    setPayFor(row)
  }
  const markPaid = () => {
    const row = payFor
    if (!row || !payDate) return
    setPayFor(null)
    const body = { status: 'paid', paid_date: new Date(payDate).toISOString() }
    update.mutate({ id: row.id, body }, {
      // Marking paid hides the row under the Unpaid filter, so the toast offers Undo.
      // It reverts directly: `row` still holds the old status.
      onSuccess: () => {
        toast((toastItem) => (
          <span className="flex items-center gap-3">
            {t('invoiceList.markedPaid')}
            <button
              className="font-semibold text-navy-300 hover:text-white underline underline-offset-2"
              onClick={() => {
                toast.dismiss(toastItem.id)
                update.mutate({ id: row.id, body: { status: 'unpaid', paid_date: null } })
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
    <>
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
              className={`tap justify-center min-w-[2.75rem] px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === f ? 'bg-white shadow-sm text-navy-900 dark:bg-navy-900 dark:text-slate-50' : 'text-slate-500 hover:text-navy-700 dark:text-slate-400'
              }`}
            >
              {t(`invoiceList.filters.${f}`)}
            </button>
          ))}
        </div>
      }
      columns={[
        { header: t('common.invoiceNo'), key: 'id', card: 'meta',
          render: r => <span className="id-chip font-mono">{r.id}</span> },
        { header: t('common.orderId'), key: 'order_id',          secondary: true,
          render: r => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.order_id}</span> },
        { header: t('common.client'), key: 'kepada_yth', card: 'title',
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
        { header: t('dashboard.amountDue'), key: 'total', card: 'amount',
          render: r => {
            // The unfiltered list, not filteredData: a Pelunasan's sibling DP
            // invoice may be 'paid' and hidden under the Unpaid filter, but
            // still needs to be found for the live amount (see invoiceAmount).
            const due = invoiceAmount(r, data)
            return (
              <div className="whitespace-nowrap">
                <span className="font-mono">{formatRp(due)}</span>
                {/* The total only when it differs from what's due (a DP or
                    Pelunasan is part of it); a full invoice's would repeat it. */}
                {due !== r.total && <div className="text-[10px] text-slate-400 dark:text-slate-500">{t('invoiceList.ofTotal', { amount: formatRp(r.total) })}</div>}
              </div>
            )
          }},
        { header: t('common.date'), key: 'tanggal', card: 'meta',
          render: r => r.tanggal ? <span className="whitespace-nowrap">{format(new Date(r.tanggal), 'dd MMM yyyy', { locale: dateLocale })}</span> : '—' },
        { header: t('common.status'), key: 'status', card: 'badge',
          // The card shows a plain badge; marking paid is in its ⋯ details.
          cardRender: r => <span className={`badge ${statusBadge(r)}`}>{statusLabel(r)}</span>,
          // A cancelled one isn't marked paid from here: reactivate its order.
          render: r => r.status === 'paid' && paidByBuktiKas(r.id) ? (
            <span className={`badge ${statusBadge(r)} min-w-16 justify-center`} title={t('invoiceList.paidByBuktiKas', { id: paidByBuktiKas(r.id) })}>{statusLabel(r)}</span>
          ) : r.status === 'cancelled' ? (
            <span className={`badge ${statusBadge(r)} min-w-16 justify-center`} title={t('invoiceList.cancelledTitle')}>{statusLabel(r)}</span>
          ) : (
            <button
              type="button"
              className={`badge ${statusBadge(r)} cursor-pointer hover:opacity-75 transition-opacity min-w-16 justify-center tap`}
              onClick={() => toggleStatus(r)}
              disabled={update.isPending}
              title={r.status === 'paid' ? t('invoiceList.markUnpaid') : t('invoiceList.markPaid')}
            >
              {statusLabel(r)}
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
    {payFor && (
      <Modal title={t('invoiceList.markPaidTitle', { id: payFor.id })} onClose={() => setPayFor(null)}>
        <div className="space-y-4">
          <FormField label={t('invoiceList.paidOn')}>
            <input className="field" type="date" value={payDate} max={todayISODate()} onChange={e => setPayDate(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!payDate || update.isPending} onClick={markPaid}>{t('invoiceList.markPaid')}</button>
            <button className="btn-secondary" onClick={() => setPayFor(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      </Modal>
    )}
    </>
  )
}
