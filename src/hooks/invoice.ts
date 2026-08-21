import { invoicesApi } from '@/api'
import { makeCrudHooks } from './crud'

export const invoiceHooks = makeCrudHooks('invoice', invoicesApi, 'Invoice')
