import { invoicesApi } from '@/api'
import { makeCrudHooks } from './crud'

export const invoiceHooks = makeCrudHooks('invoice', invoicesApi, 'Invoice')

/** The invoices that count in money figures (owed, billed, overdue…): all
 *  but those cancelled with their order. Paid invoices of a cancelled order
 *  stay — that money was received. */
export const billable = <T extends { status: string }>(invoices: T[]): T[] => invoices.filter(i => i.status !== 'cancelled')
