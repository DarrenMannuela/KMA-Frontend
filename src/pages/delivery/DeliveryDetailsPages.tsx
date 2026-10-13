import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { deliveryHooks } from '@/hooks'
import { LoadingState, ErrorState } from '@/components/ui/Page'
import { useDateLocale } from '@/i18n/dateLocale'
import { DeliveryItemsManager } from './DeliveryItemsManager'

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const deliveryId = decodeURIComponent(id ?? '')

  const {
    data: delivery,
    isLoading: deliveryLoading,
    isError: deliveryError,
    refetch: refetchDelivery,
  } = deliveryHooks.useGet(deliveryId)

  const isDO = delivery?.type === 'DO'

  if (deliveryLoading) return <div className="p-4 md:p-6"><LoadingState label={t('delivery.loading')} /></div>
  // A failed fetch shows Retry, not "Delivery not found".
  if (deliveryError) {
    return <div className="p-4 md:p-6"><ErrorState what={t('delivery.errorWhat')} onRetry={() => refetchDelivery()} /></div>
  }
  if (!delivery) return <div className="p-4 md:p-6"><ErrorState what={t('delivery.errorWhat')} /></div>

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* min-w-0 lets the title shrink and wrap so Print stays on screen. */}
      <div className="flex items-center gap-3 flex-wrap fade-up">
        <button onClick={() => navigate('/delivery')} className="btn-secondary !px-2.5 shrink-0" title={t('delivery.backToDelivery')}>
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-semibold text-navy-900 leading-tight">{delivery.id}</h1>
            <span className={`badge text-xs ${isDO ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {isDO ? t('delivery.deliveryOrder') : t('delivery.suratJalan')}
            </span>
          </div>
          <p className="text-slate-400 text-xs truncate">
            {delivery.address}
            {delivery.contact_person && ` · ${delivery.contact_person}`}
            {delivery.date && ` · ${format(new Date(delivery.date), 'dd MMM yyyy', { locale: dateLocale })}`}
            {delivery.client_id && (
              <>
                {' · '}
                <button
                  className="inline-flex items-center gap-1 text-navy-500 hover:underline"
                  onClick={() => navigate(`/clients/${delivery.client_id}`)}
                >
                  <Building2 size={11} /> {t('common.clientRecord')}
                </button>
              </>
            )}
            {delivery.order_id && (
              <>
                {' · '}{t('delivery.viewOrder')}{' '}
                <button
                  className="font-mono text-navy-500 hover:underline"
                  onClick={() => navigate(`/orders/${encodeURIComponent(delivery.order_id!)}`)}
                >
                  {delivery.order_id}
                </button>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate(`/delivery/${encodeURIComponent(delivery.id)}/print`)}
          className="btn-secondary flex items-center gap-1.5 shrink-0"
        >
          <Printer size={14} /> {t('delivery.print')}
        </button>
      </div>

      {/* Items — locked to this delivery, no picker (omitting
          onDeliveryIdChange puts the manager in "locked" mode: a read-only
          chip instead of a Delivery <select>). */}
      <DeliveryItemsManager deliveryId={deliveryId} />
    </div>
  )
}
