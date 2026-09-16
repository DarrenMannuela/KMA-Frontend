import { Suspense, lazy, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminRoute } from '@/components/auth/AdminRoute'
import { MustChangePasswordRoute } from '@/components/auth/MustChangePasswordRoute'
import { RedirectDirectAccess } from '@/components/auth/RedirectDirectAccess'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Every page is loaded on demand instead of all at once — this used to be
// one ~600KB bundle shipped in full to anyone opening the dashboard, print
// pages/admin/reports included, even though a given visit only ever
// touches a handful of routes. React.lazy + the two Suspense boundaries
// below turn each of these into its own chunk, fetched the first time its
// route is actually visited. Purely a loading-strategy change — nothing
// about how any of these pages behave is different.
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
const YearlyReportPage = lazy(() => import('@/pages/reports/YearlyReportPage').then(m => ({ default: m.YearlyReportPage })))
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

// Print pages stay outside the Sidebar/Topbar chrome (unchanged from
// before) — they're meant to be a clean printable page, not the app
// shell. Login is the same: it gets its own centered layout, not the
// dashboard shell, and it's the one route that must NOT be wrapped in
// ProtectedRoute (that would infinite-redirect).
function AppShell() {
  const location = useLocation()
  // Only meaningful below md — see Sidebar's own md:translate-x-0, which
  // keeps it permanently visible above that breakpoint regardless of this.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* min-w-0 is load-bearing, not decorative — a flex item's default
          min-width is "auto" (its content's own min-content size), NOT 0,
          so without this a flex-1 item ignores the flex container's actual
          available width and instead demands at least as much as its
          widest descendant needs (e.g. a wide table three levels down,
          even one already wrapped in its own overflow-x-auto). That
          demand propagates straight up through every unclamped flex
          ancestor to html/body, which is what made entire pages need
          horizontal scrolling on a phone even though the offending table
          had its own scroll container — the container just was never
          actually constrained to a width narrower than its content in the
          first place. This single min-w-0 is what makes that constraint
          real for every page under it. */}
      <div className="flex-1 flex flex-col md:ml-[240px] min-h-screen min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {/* Scoped to routed content only, so Sidebar/Topbar stay usable
              if a page crashes — and keyed off the path so clicking to a
              different page recovers on its own instead of being stuck on
              the fallback until a manual reload (see ErrorBoundary's own
              resetKeys comment). */}
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
            <Route path="/reports/yearly"                   element={<YearlyReportPage />} />
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

          {/* Where an invited user's emailed link lands. Public for the
              same reason /login is: no session exists yet at this
              point — wrapping it in ProtectedRoute would redirect it
              straight to /login before the form ever renders. */}
          <Route path="/set-password" element={<SetPasswordPage />} />

          {/* Reached from MustChangePasswordRoute below (or directly, by
              a user who bookmarks it). Deliberately only wrapped in
              ProtectedRoute — NOT in MustChangePasswordRoute itself, or
              a user who still needs to change their password would be
              redirected right back here in a loop. */}
          <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

          {/* Print routes: no sidebar/topbar chrome, but still require
              a session — someone printing an invoice is still a
              logged-in staff member. RedirectDirectAccess sends a
              cold/direct hit on one of these (typed URL, reopened tab,
              refresh) to the dashboard instead — see its own comment for
              why and for the refresh trade-off. Nested inside
              ProtectedRoute so an unauthenticated direct hit still goes
              to /login first, same as before. */}
          <Route path="/invoice/:id" element={<ProtectedRoute><RedirectDirectAccess><InvoicePrintPage /></RedirectDirectAccess></ProtectedRoute>} />
          <Route path="/invoice/:id/kwitansi" element={<ProtectedRoute><RedirectDirectAccess><KwitansiPrintPage /></RedirectDirectAccess></ProtectedRoute>} />
          <Route path="/delivery/:id/print" element={<ProtectedRoute><RedirectDirectAccess><DeliveryPrintPage /></RedirectDirectAccess></ProtectedRoute>} />

          {/* Everything else lives behind the app shell, and the whole
              shell is gated by one ProtectedRoute rather than wrapping
              each inner <Route> individually. MustChangePasswordRoute
              sits just inside that: anyone with a still-temporary
              password gets bounced to /change-password before they can
              reach any page in the shell. */}
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
