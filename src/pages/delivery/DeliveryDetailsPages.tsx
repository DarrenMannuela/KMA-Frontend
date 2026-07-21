import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { deliveryHooks } from '@/hooks'
import { DeliveryItemsManager } from './DeliveryItemsManager'

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const deliveryId = decodeURIComponent(id ?? '')

  const { data: delivery, isLoading: deliveryLoading } = deliveryHooks.useGet(deliveryId)

  const isDO = delivery?.type === 'DO'

  if (deliveryLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!delivery) return <div className="p-8 text-red-400">Delivery not found.</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/delivery')} className="btn-secondary flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900">{delivery.id}</h1>
            <span className={`badge text-xs ${isDO ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {isDO ? 'Delivery Order' : 'Surat Jalan'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {delivery.address}
            {delivery.contact_person && ` · ${delivery.contact_person}`}
            {delivery.date && ` · ${format(new Date(delivery.date), 'dd MMM yyyy')}`}
            {delivery.order_id && (
              <>
                {' · Order '}
                <button
                  className="font-mono text-navy-600 hover:underline"
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
          className="btn-secondary flex items-center gap-1.5"
        >
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Items — locked to this delivery, no picker (omitting
          onDeliveryIdChange puts the manager in "locked" mode: a read-only
          chip instead of a Delivery <select>). */}
      <DeliveryItemsManager deliveryId={deliveryId} />
    </div>
  )
}