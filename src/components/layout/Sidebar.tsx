import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, ShoppingBag,
  Truck, BarChart3,
  Circle, ChevronsLeft, ChevronsRight, ShieldCheck, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type RouteStatus = 'live' | 'stub'

// Route status dots and their legend: development builds only.
const SHOW_DEV_STATUS = import.meta.env.DEV

interface NavItem {
  labelKey: string
  path: string
  icon: LucideIcon
  status?: RouteStatus
  /** Other paths that should also count as "in this section" for the
   *  active-state highlight — e.g. Finance's sidebar entry stays lit up
   *  across all of FinanceSection's own tabs (Production, Operations,
   *  Bukti Kas, Budgets, Suppliers), not just the literal /finance route
   *  those tabs replace as the sidebar's single entry point into Finance. */
  activePrefixes?: string[]
}

// Dashboard, then each section as one link. Orders and Finance each have
// several pages, reached from the tab bar at the top of those pages
// (OrdersSection, FinanceSection) rather than a second copy of the same nav
// here; their link stays lit on every one of their tabs.
const STANDALONE: NavItem[] = [
  { labelKey: 'sidebar.dashboard', path: '/', icon: LayoutDashboard },
  {
    labelKey: 'sidebar.ordersGroup', path: '/orders', icon: ShoppingBag, status: 'live',
    activePrefixes: ['/items', '/invoice', '/clients'],
  },
  { labelKey: 'sidebar.delivery', path: '/delivery', icon: Truck, status: 'live' },
  {
    labelKey: 'sidebar.financeGroup', path: '/finance', icon: BarChart3, status: 'live',
    activePrefixes: ['/production', '/operations', '/bukti-kas', '/finance/budgets', '/suppliers'],
  },
]

function NavItemLink({ item, onNavigate, collapsed }: { item: NavItem; onNavigate?: () => void; collapsed?: boolean }) {
  const { t } = useTranslation()
  const location = useLocation()
  const extraActive = item.activePrefixes?.some(p => location.pathname === p || location.pathname.startsWith(`${p}/`)) ?? false
  const label = t(item.labelKey)
  return (
    <NavLink
      to={item.path}
      end={item.path === '/' || item.path === '/finance'}
      // Closes the mobile drawer on navigation (undefined on desktop).
      onClick={onNavigate}
      // Only a real tooltip once the label itself is hidden (icon rail,
      // docked) — see the label span below for why this can't just key off
      // `collapsed` alone.
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group ${collapsed ? 'dock:justify-center dock:px-0' : ''} ${
          (isActive || extraActive)
            ? 'bg-white/10 text-white'
            : 'text-navy-300 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={`w-4 h-4 shrink-0 ${(isActive || extraActive) ? 'text-gold-400' : 'text-navy-400 group-hover:text-navy-200'}`} />
          {/* `dock:hidden`, not a plain `hidden` — `collapsed` is a
             docked-only concept, so the mobile drawer (same tree, same prop
             value whenever a desktop toggle happened to leave it `true`)
             keeps its full label regardless. */}
          <span className={`flex-1 ${collapsed ? 'dock:hidden' : ''}`}>{label}</span>
          {SHOW_DEV_STATUS && item.status === 'live' && <Circle className={`w-2 h-2 fill-green-400 text-green-400 shrink-0 ${collapsed ? 'dock:hidden' : ''}`} />}
          {SHOW_DEV_STATUS && item.status === 'stub' && <Circle className={`w-2 h-2 fill-amber-400 text-amber-400 shrink-0 opacity-60 ${collapsed ? 'dock:hidden' : ''}`} />}
        </>
      )}
    </NavLink>
  )
}

interface SidebarProps {
  /** Whether the mobile drawer is open — irrelevant once docked (`dock:`),
   *  where the sidebar is always visible via dock:translate-x-0 regardless
   *  of this. */
  open: boolean
  onClose: () => void
  /** Icon-rail mode — docked only (see the toggle button below); the
   *  mobile drawer stays full-width regardless, since every class this
   *  flows into is itself gated behind `dock:`. Owned by AppShell, not
   *  this component, so the content pane's own margin can stay in sync. */
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const { user } = useAuth()
  const { t } = useTranslation()

  return (
    <>
      {/* Backdrop for the mobile drawer; a click closes it. z-40: above
         every in-page sticky/absolute element (the highest elsewhere in the
         app is z-40 too, e.g. a bulk-action bar) so the drawer and its
         backdrop always read as the topmost thing on screen while open,
         never bled through by page content tied at the same z-index. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/50 backdrop-blur-sm dock:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-screen w-[240px] bg-navy-950 sidebar-pattern flex flex-col z-50 dock:shadow-sidebar
                    transition-[transform,width] duration-200 dock:translate-x-0 ${open ? 'translate-x-0 shadow-sidebar' : '-translate-x-full'} ${collapsed ? 'dock:w-[72px]' : 'dock:w-[240px]'}`}
      >
        {/* Logo */}
        <div className={`px-5 py-5 border-b border-navy-800 flex items-center justify-between ${collapsed ? 'dock:justify-center' : ''}`}>
          <div className="flex items-center gap-3">
              <img src="/Logo.png" alt="KMA" className="w-9 h-9 rounded-xl object-contain shrink-0" />
            <div className={collapsed ? 'dock:hidden' : ''}>
              <p className="font-display font-bold text-white text-sm leading-tight">KMA</p>
              <p className="text-navy-400 text-[10px] font-mono leading-tight">Kreasi Makmur Abadi</p>
            </div>
          </div>
          {/* Close button — only while the drawer can open; once docked the
              sidebar isn't dismissible, so this has nothing to do there. */}
          {/* Same reasoning as Topbar's menu button: a full 44px tap target
              for the control that closes the whole nav drawer. */}
          <button onClick={onClose} className="dock:hidden p-3.5 -m-2 rounded-lg text-navy-400 hover:bg-white/5 hover:text-white transition-colors" title={t('shell.closeMenu')} aria-label={t('shell.closeMenu')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {/* Dashboard first */}
          <NavItemLink item={STANDALONE[0]} onNavigate={onClose} collapsed={collapsed} />

          {/* Orders, Delivery, Finance: one link each (see STANDALONE). */}
          <div className="pt-2 space-y-0.5">
            {STANDALONE.slice(1).map(item => (
              <NavItemLink key={item.path} item={item} onNavigate={onClose} collapsed={collapsed} />
            ))}
          </div>

          {/* Admin-only: user management. Assumes useAuth()'s user has a
              `role` field matching the Go backend ('admin' | 'staff') —
              same assumption as Topbar's AccountMenu. */}
          {user?.role === 'admin' && (
            <div className="pt-2 mt-2 border-t border-navy-800 space-y-0.5">
              <NavItemLink item={{ labelKey: 'sidebar.users', path: '/admin/users', icon: ShieldCheck }} onNavigate={onClose} collapsed={collapsed} />
            </div>
          )}
        </nav>

        {/* Collapse toggle — a slim icon rail only means anything once
           docked; the mobile drawer already has its own close (X) above,
           and shrinking a temporary overlay would only leave touch with
           less to work with, not more room for anything. */}
        <div className="hidden dock:block border-t border-navy-800 px-3 py-2">
          <button
            onClick={onToggleCollapsed}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-navy-300 hover:bg-white/5 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4 shrink-0" /> : <ChevronsLeft className="w-4 h-4 shrink-0" />}
            <span className={collapsed ? 'hidden' : ''}>{t('shell.collapse')}</span>
          </button>
        </div>

        {/* Legend — dev-only, see SHOW_DEV_STATUS above. `dock:hidden` only
           (not a JS branch) when collapsed, same reasoning as everywhere
           else here: the mobile drawer still wants this regardless. */}
        {SHOW_DEV_STATUS && (
          <div className={`px-5 py-3 border-t border-navy-800 space-y-1 ${collapsed ? 'dock:hidden' : ''}`}>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-green-400 text-green-400" />
              <span className="text-navy-500 text-[10px]">{t('shell.legendLive')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-amber-400 text-amber-400 opacity-60" />
              <span className="text-navy-500 text-[10px]">{t('shell.legendStub')}</span>
            </div>
            <p className="text-navy-600 text-[10px] font-mono pt-1">{t('shell.devVersion')}</p>
          </div>
        )}
      </aside>
    </>
  )
}