import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { DashboardPage } from '@/pages/DashboardPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { ItemsPage } from '@/pages/orders/ItemsPage'
import { InvoicePrintPage } from '@/pages/orders/InvoicePrintPage'
import { DeliveryPage } from '@/pages/delivery/DeliveryPages'
import { DeliveryDetailPage } from '@/pages/delivery/DeliveryDetailsPages'
import { DeliveryPrintPage } from '@/pages/delivery/DeliveryPrintPage'
import { ProductionPage } from '@/pages/production/ProductionPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { OperationsPage } from '@/pages/operations/OperationsPage'
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage'
import { InvoiceListPage } from '@/pages/orders/InvoiceListPage'
import { KwitansiPrintPage} from '@/pages/orders/KiwitansiPrintPage'
import { ClientsPage } from '@/pages/client/ClientsPage'
import { ClientDetailPage } from '@/pages/client/ClientDetailPage'
import { ClientItemDetailPage } from '@/pages/client/ClientItemDetailPage'
import { YearlyReportPage } from '@/pages/reports/YearlyReportPage'


export default function App() {
  return (
    <>
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex-1 flex flex-col ml-[240px] min-h-screen">
          <Topbar />
          <main className="flex-1 overflow-y-auto bg-slate-50">
            <Routes>
              <Route path="/"                     element={<DashboardPage />} />
              <Route path="/orders"               element={<OrdersPage />} />
              <Route path="/items"                element={<ItemsPage />} />
              <Route path="/invoice"              element={<InvoiceListPage />} />
              <Route path="/invoice/:id"          element={<InvoicePrintPage />} />
              <Route path="/delivery"             element={<DeliveryPage />} />
              <Route path="/delivery/:id"         element={<DeliveryDetailPage />} />
              <Route path="/delivery/:id/print"   element={<DeliveryPrintPage />} />
              <Route path="/production"           element={<ProductionPage />} />
              <Route path="/suppliers"            element={<SuppliersPage />} />
              <Route path="/operations"           element={<OperationsPage />} />
              <Route path="/orders/:id"           element={<OrderDetailPage />} />
              <Route path="/invoice/:id/kwitansi" element={<KwitansiPrintPage />} />
              <Route path="/clients"                        element={<ClientsPage />} />
              <Route path="/clients/:id"                    element={<ClientDetailPage />} />
              <Route path="/clients/:clientId/items/:itemId" element={<ClientItemDetailPage />} />
              <Route path="/reports/yearly"                   element={<YearlyReportPage />} />
            </Routes>
          </main>
        </div>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: "'Sora', sans-serif",
            fontSize: '13px',
            background: '#131a32',
            color: '#f1f5f9',
            borderRadius: '10px',
            border: '1px solid #1e2748',
          },
          success: { iconTheme: { primary: '#fbbf24', secondary: '#131a32' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#131a32' } },
        }}
      />
    </>
  )
}