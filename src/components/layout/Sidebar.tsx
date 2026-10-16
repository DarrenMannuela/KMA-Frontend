import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, ShoppingBag, ListOrdered, FileText,
  Truck, Factory, Users, Wrench, BarChart3, PiggyBank, Banknote,
  Building2, Circle, ChevronDown, ShieldCheck, X,
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
}

interface NavGroup {
  labelKey: string
  icon: LucideIcon
  items: NavItem[]
}

const STANDALONE: NavItem[] = [
  { labelKey: 'sidebar.dashboard', path: '/', icon: LayoutDashboard },
  { labelKey: 'sidebar.delivery', path: '/delivery', icon: Truck, status: 'live' },
]

const GROUPS: NavGroup[] = [
  {
    labelKey: 'sidebar.ordersGroup',
    icon: ShoppingBag,
    items: [
      { labelKey: 'sidebar.clients',     path: '/clients',      icon: Building2,    status: 'live' },
      { labelKey: 'sidebar.allOrders',  path: '/orders',      icon: ShoppingBag, status: 'live' },
      { labelKey: 'sidebar.orderItems', path: '/items',        icon: ListOrdered, status: 'live' },
      { labelKey: 'sidebar.invoice', path: '/invoice',  icon: FileText,    status: 'live' },
    ],
  },
  {
    labelKey: 'sidebar.financeGroup',
    icon: BarChart3,
    items: [
      { labelKey: 'sidebar.overview',   path: '/finance',    icon: BarChart3, status: 'live' },
      { labelKey: 'sidebar.production', path: '/production', icon: Factory, status: 'live' },
      { labelKey: 'sidebar.operations', path: '/operations', icon: Wrench,  status: 'live' },
      { labelKey: 'sidebar.buktiKas',  path: '/bukti-kas',  icon: Banknote, status: 'live' },
      { labelKey: 'sidebar.budgetsAndRecurring', path: '/finance/budgets', icon: PiggyBank, status: 'live' },
      { labelKey: 'sidebar.suppliers',  path: '/suppliers',  icon: Users,   status: 'live' },
    ],
  },
]

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={item.path}
      end={item.path === '/' || item.path === '/finance'}
      // Closes the mobile drawer on navigation (undefined on desktop).
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-navy-300 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-gold-400' : 'text-navy-400 group-hover:text-navy-200'}`} />
          <span className="flex-1">{t(item.labelKey)}</span>
          {SHOW_DEV_STATUS && item.status === 'live' && <Circle className="w-2 h-2 fill-green-400 text-green-400 shrink-0" />}
          {SHOW_DEV_STATUS && item.status === 'stub' && <Circle className="w-2 h-2 fill-amber-400 text-amber-400 shrink-0 opacity-60" />}
        </>
      )}
    </NavLink>
  )
}

function NavGroupSection({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const location = useLocation()
  const { t } = useTranslation()
  const isAnyActive = group.items.some(i => location.pathname.startsWith(i.path) && i.path !== '/')
  const [open, setOpen] = useState(isAnyActive)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-navy-300 hover:bg-white/5 hover:text-white transition-all duration-150 group"
      >
        <group.icon className="w-4 h-4 shrink-0 text-navy-400 group-hover:text-navy-200" />
        <span className="flex-1 text-left">{t(group.labelKey)}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-navy-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="ml-3 pl-3 border-l border-navy-800 mt-0.5 space-y-0.5">
          {group.items.map(item => (
            <NavItemLink key={item.path} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  /** Whether the mobile drawer is open — irrelevant on desktop (md:), where
   *  the sidebar is always visible via md:translate-x-0 regardless of this. */
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth()

  return (
    <>
      {/* Backdrop for the mobile drawer; a click closes it. */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-navy-950/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-screen w-[240px] bg-navy-950 sidebar-pattern flex flex-col z-30 shadow-sidebar
                    transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-navy-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <img src="/Logo.png" alt="KMA" className="w-9 h-9 rounded-xl object-contain shrink-0" />
            <div>
              <p className="font-display font-bold text-white text-sm leading-tight">KMA</p>
              <p className="text-navy-400 text-[10px] font-mono leading-tight">Kreasi Makmur Abadi</p>
            </div>
          </div>
          {/* Close button — mobile only; the sidebar isn't a dismissible
              drawer on desktop, so this has nothing to do there. */}
          {/* Same reasoning as Topbar's menu button: a full 44px tap target
              for the control that closes the whole nav drawer. */}
          <button onClick={onClose} className="md:hidden p-3.5 -m-2 rounded-lg text-navy-400 hover:bg-white/5 hover:text-white transition-colors" title="Close menu">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {/* Dashboard first */}
          <NavItemLink item={STANDALONE[0]} onNavigate={onClose} />

          <div className="pt-2 space-y-0.5">
            {/* Orders group */}
            <NavGroupSection group={GROUPS[0]} onNavigate={onClose} />

            {/* Delivery standalone, after Orders */}
            <NavItemLink item={STANDALONE[1]} onNavigate={onClose} />

            {/* Finances group */}
            <NavGroupSection group={GROUPS[1]} onNavigate={onClose} />
          </div>

          {/* Admin-only: user management. Assumes useAuth()'s user has a
              `role` field matching the Go backend ('admin' | 'staff') —
              same assumption as Topbar's AccountMenu. */}
          {user?.role === 'admin' && (
            <div className="pt-2 mt-2 border-t border-navy-800 space-y-0.5">
              <NavItemLink item={{ labelKey: 'sidebar.users', path: '/admin/users', icon: ShieldCheck }} onNavigate={onClose} />
            </div>
          )}
        </nav>

        {/* Legend — dev-only, see SHOW_DEV_STATUS above */}
        {SHOW_DEV_STATUS && (
          <div className="px-5 py-3 border-t border-navy-800 space-y-1">
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-green-400 text-green-400" />
              <span className="text-navy-500 text-[10px]">Live (DB wired)</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-2 h-2 fill-amber-400 text-amber-400 opacity-60" />
              <span className="text-navy-500 text-[10px]">Stub (placeholder)</span>
            </div>
            <p className="text-navy-600 text-[10px] font-mono pt-1">v0.1.0 · Workshop Admin</p>
          </div>
        )}
      </aside>
    </>
  )
}