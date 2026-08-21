import { deliveryApi, deliveryItemApi } from '@/api'
import { makeCrudHooks } from './crud'

export const deliveryHooks     = makeCrudHooks('delivery',       deliveryApi,      'Delivery')
export const deliveryItemHooks = makeCrudHooks('delivery-orders', deliveryItemApi, 'Delivery item')
