import { suppliersApi } from '@/api'
import { makeCrudHooks } from './crud'

export const supplierHooks = makeCrudHooks('suppliers', suppliersApi, 'Supplier')
