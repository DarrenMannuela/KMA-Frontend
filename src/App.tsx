import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { DashboardPage } from '@/pages/DashboardPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { ItemsPage } from '@/pages/orders/ItemsPage'
import { OrderRecapPage } from '@/pages/orders/OrderRecapPage'
import { DeliveryPage, DeliveryOrdersPage, SuratJalanPage } from '@/pages/delivery/DeliveryPages'
import { ProductionPage } from '@/pages/production/ProductionPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { OperationsPage } from '@/pages/operations/OperationsPage'
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage'

export default function App() {
  return (
    <>
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex-1 flex flex-col ml-[240px] min-h-screen">
          <Topbar />
          <main className="flex-1 overflow-y-auto bg-slate-50">
            <Routes>
              <Route path="/"                element={<DashboardPage />} />
              <Route path="/orders"          element={<OrdersPage />} />
              <Route path="/items"           element={<ItemsPage />} />
              <Route path="/order-recap"     element={<OrderRecapPage />} />
              <Route path="/delivery"        element={<DeliveryPage />} />
              <Route path="/delivery-orders" element={<DeliveryOrdersPage />} />
              <Route path="/surat-jalan"     element={<SuratJalanPage />} />
              <Route path="/production"      element={<ProductionPage />} />
              <Route path="/suppliers"       element={<SuppliersPage />} />
              <Route path="/operations"      element={<OperationsPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
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
