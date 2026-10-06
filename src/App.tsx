import { Suspense, lazy, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminRoute } from '@/components/auth/AdminRoute'
import { MustChangePasswordRoute } from '@/components/auth/MustChangePasswordRoute'
import { RedirectDirectAccess } from '@/components/auth/RedirectDirectAccess'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Each page is its own chunk, loaded the first time its route is visited.
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage').then(m => ({ default: m.OrdersPage })))
const ItemsPage = lazy(() => import('@/pages/orders/ItemsPage').then(m => ({ default: m.ItemsPage })))
const InvoicePrintPage = lazy(() => import('@/pages/orders/InvoicePrintPage').then(m => ({ default: m.InvoicePrintPage })))
const DeliveryPage = lazy(() => import('@/pages/delivery/DeliveryPages').then(m => ({ default: m.DeliveryPage })))
const DeliveryDetailPage = lazy(() => import('@/pages/delivery/DeliveryDetailsPages').then(m => ({ default: m.DeliveryDetailPage })))
const DeliveryPrintPage = lazy(() => import('@/pages/delivery/DeliveryPrintPage').then(m => ({ default: m.DeliveryPrintPage })))
const ProductionPage = lazy(() => import('@/pages/production/ProductionPage').then(m => ({ default: m.ProductionPage })))
const SuppliersPage = lazy(() => import('@/pages/suppliers/SuppliersPage').then(m => ({ default: m.SuppliersPage })))
const OperationsPage = lazy(() => import('@/pages/operations/OperationsPage').then(m => ({ default: m.OperationsPage })))
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })))
const InvoiceListPage = lazy(() => import('@/pages/orders/InvoiceListPage').then(m => ({ default: m.InvoiceListPage })))
const KwitansiPrintPage = lazy(() => import('@/pages/orders/KwitansiPrintPage').then(m => ({ default: m.KwitansiPrintPage })))
const ClientsPage = lazy(() => import('@/pages/client/ClientsPage').then(m => ({ default: m.ClientsPage })))
const ClientDetailPage = lazy(() => import('@/pages/client/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })))
const ClientItemDetailPage = lazy(() => import('@/pages/client/ClientItemDetailPage').then(m => ({ default: m.ClientItemDetailPage })))
const FinancePage = lazy(() => import('@/pages/finance/FinancePage').then(m => ({ default: m.FinancePage })))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const SetPasswordPage = lazy(() => import('@/pages/auth/SetPasswordPage').then(m => ({ default: m.SetPasswordPage })))
const ChangePasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage').then(m => ({ default: m.ChangePasswordPage })))
const UsersPage = lazy(() => import('@/pages/users/UsersPage').then(m => ({ default: m.UsersPage })))

// Full-page variant for the top-level Routes (login, print pages, the
// AppShell route itself) — nothing else is on screen yet at that point,
// same visual language as ProtectedRoute's own loading state.
function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 rounded-full border-2 border-navy-200 border-t-navy-900 animate-spin" />
    </div>
  )
}

// Scoped variant for routes inside AppShell — Sidebar/Topbar stay put
// while just the routed content area shows this, instead of the whole
// screen blanking out on every in-app navigation.
function ContentSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-navy-200 border-t-navy-900 animate-spin" />
    </div>
  )
}

// Print pages and login render outside the sidebar/topbar shell.
function AppShell() {
  const location = useLocation()
  // Only meaningful below md — see Sidebar's own md:translate-x-0, which
  // keeps it permanently visible above that breakpoint regardless of this.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* min-w-0 lets this flex item shrink below its content's width, so wide
         tables scroll inside their own containers instead of the whole page. */}
      <div className="flex-1 flex flex-col md:ml-[240px] min-h-screen min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {/* Only routed content is behind the boundary; it resets on navigation. */}
          <ErrorBoundary resetKeys={[location.pathname]}>
          <Suspense fallback={<ContentSpinner />}>
          <Routes>
            <Route path="/"                     element={<DashboardPage />} />
            <Route path="/orders"               element={<OrdersPage />} />
            <Route path="/items"                element={<ItemsPage />} />
            <Route path="/invoice"              element={<InvoiceListPage />} />
            <Route path="/delivery"             element={<DeliveryPage />} />
            <Route path="/delivery/:id"         element={<DeliveryDetailPage />} />
            <Route path="/production"           element={<ProductionPage />} />
            <Route path="/suppliers"            element={<SuppliersPage />} />
            <Route path="/operations"           element={<OperationsPage />} />
            <Route path="/orders/:id"           element={<OrderDetailPage />} />
            <Route path="/clients"                        element={<ClientsPage />} />
            <Route path="/clients/:id"                    element={<ClientDetailPage />} />
            <Route path="/clients/:clientId/items/:itemId" element={<ClientItemDetailPage />} />
            <Route path="/finance"                        element={<FinancePage />} />
            <Route path="/reports/yearly"                 element={<Navigate to="/finance" replace />} />
            <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <>
        <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* An invited user's link lands here, before any session exists. */}
          <Route path="/set-password" element={<SetPasswordPage />} />

          {/* Not inside MustChangePasswordRoute, which redirects here. */}
          <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

          {/* Print routes: logged in, no app chrome. A direct hit (typed URL, refresh)
             goes to the dashboard instead; see RedirectDirectAccess. */}
          <Route path="/invoice/:id" element={<ProtectedRoute><RedirectDirectAccess><InvoicePrintPage /></RedirectDirectAccess></ProtectedRoute>} />
          <Route path="/invoice/:id/kwitansi" element={<ProtectedRoute><RedirectDirectAccess><KwitansiPrintPage /></RedirectDirectAccess></ProtectedRoute>} />
          <Route path="/delivery/:id/print" element={<ProtectedRoute><RedirectDirectAccess><DeliveryPrintPage /></RedirectDirectAccess></ProtectedRoute>} />

          {/* Everything else is behind one ProtectedRoute; a temporary password must be
             changed first. */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MustChangePasswordRoute>
                  <AppShell />
                </MustChangePasswordRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
        </Suspense>

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
    </AuthProvider>
  )
}
