import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ordersApi, itemsApi } from '@/api'
import type { Item } from '@/types'
import { makeCrudHooks } from './crud'
import { deliveryHooks, deliveryItemHooks } from './delivery'

export const orderHooks = makeCrudHooks('orders', ordersApi, 'Order')
export const itemHooks  = makeCrudHooks('items',  itemsApi,  'Item')

// ─────────────────────────────────────────────────────────────────────────────
// A DO's box contents are constrained by what was actually ordered — this
// computes, for every Item on an Order, how much has already gone out
// across ALL deliveries linked to that order (not just the one currently
// being edited), and what's left. Matching is by item_name+size since
// there's no order_item_id FK on DeliveryItem — same convention Items.go
// already uses to dedupe order items (see the comment in
// OrderDetailPage's ItemForm).
//
// excludeItemId lets a specific DeliveryItem's own amount be left out of
// the "already delivered" sum — used when editing that exact item, so its
// current amount doesn't count against itself when computing how much
// headroom is left.
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderRemainingItem extends Item {
  delivered: number
  remaining: number
}

export function useOrderRemainingItems(
  orderId: string | null | undefined,
  excludeItemId?: number
): OrderRemainingItem[] {
  const { data: orderItems = [] } = useQuery({
    queryKey: ['items', 'by-order', orderId],
    queryFn: () => itemsApi.getByOrder(orderId as string),
    enabled: !!orderId,
  })
  const { data: deliveries = [] } = deliveryHooks.useList()
  const { data: deliveryItems = [] } = deliveryItemHooks.useList()

  return useMemo(() => {
    if (!orderId) return []
    const deliveryIdsForOrder = new Set(
      deliveries.filter(d => d.order_id === orderId).map(d => d.id)
    )
    const deliveredMap = new Map<string, number>()
    deliveryItems.forEach(di => {
      if (di.id === excludeItemId) return
      if (!deliveryIdsForOrder.has(di.delivery_id)) return
      const key = `${di.item_name}|${di.size ?? ''}`
      deliveredMap.set(key, (deliveredMap.get(key) ?? 0) + di.amount)
    })
    return orderItems.map(oi => {
      const key = `${oi.item_name}|${oi.size ?? ''}`
      const delivered = deliveredMap.get(key) ?? 0
      return { ...oi, delivered, remaining: Math.max(0, oi.amount - delivered) }
    })
  }, [orderId, orderItems, deliveries, deliveryItems, excludeItemId])
}
