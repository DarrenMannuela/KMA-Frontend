import { Building2, FileText, ListOrdered, ShoppingBag } from 'lucide-react'
import { SectionTabs, type SectionTab } from '@/components/layout/SectionTabs'

// All Orders first: it's where the sidebar's Orders link lands, the way
// Finance's Overview is.
const TABS: SectionTab[] = [
  { to: '/orders', labelKey: 'sidebar.allOrders', icon: ShoppingBag },
  { to: '/items', labelKey: 'sidebar.orderItems', icon: ListOrdered },
  { to: '/invoice', labelKey: 'sidebar.invoice', icon: FileText },
  { to: '/clients', labelKey: 'sidebar.clients', icon: Building2 },
]

/** The order pages (orders, their items, invoices, clients) under one tab
 *  bar, the same as Finance's. */
export function OrdersSection() {
  return <SectionTabs tabs={TABS} labelKey="sidebar.ordersGroup" sheetTitleKey="ordersTabs.sectionTitle" />
}
