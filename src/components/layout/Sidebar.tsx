import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, ListOrdered, FileText,
  Truck, PackageCheck, ScrollText, Factory, Users, Wrench,
  Circle,
} from 'lucide-react'

// 🟢 live = wired to DB handler  🟡 stub = placeholder JSON
type RouteStatus = 'live' | 'stub'

const NAV: { label: string; path: string; icon: typeof LayoutDashboard; status?: RouteStatus }[] = [
  { label: 'Dashboard',       path: '/',               icon: LayoutDashboard },
  { label: 'Orders',          path: '/orders',          icon: ShoppingBag,  status: 'stub' },
  { label: 'Order Items',     path: '/items',           icon: ListOrdered,  status: 'stub' },
  { label: 'Order Recap',     path: '/order-recap',     icon: FileText,     status: 'stub' },
  { label: 'Delivery',        path: '/delivery',        icon: Truck,        status: 'stub' },
  { label: 'Delivery Orders', path: '/delivery-orders', icon: PackageCheck, status: 'stub' },
  { label: 'Surat Jalan',     path: '/surat-jalan',     icon: ScrollText,   status: 'stub' },
  { label: 'Production',      path: '/production',      icon: Factory,      status: 'stub' },
  { label: 'Suppliers',       path: '/suppliers',       icon: Users,        status: 'live' },
  { label: 'Operations',      path: '/operations',      icon: Wrench,       status: 'stub' },
]

export function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[240px] bg-navy-950 sidebar-pattern flex flex-col z-30 shadow-sidebar">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-navy-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold-500 flex items-center justify-center shrink-0">
            <span className="font-display font-bold text-navy-950 text-sm leading-none">K</span>
          </div>
          <div>
            <p className="font-display font-bold text-white text-sm leading-tight">KMA</p>
            <p className="text-navy-400 text-[10px] font-mono leading-tight">Kreasi Makmur Abadi</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {NAV.map(({ label, path, icon: Icon, status }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-navy-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-gold-400' : 'text-navy-400 group-hover:text-navy-200'}`} />
                <span className="flex-1">{label}</span>
                {status === 'live' && (
                  <Circle className="w-2 h-2 fill-green-400 text-green-400 shrink-0" />
                )}
                {status === 'stub' && (
                  <Circle className="w-2 h-2 fill-amber-400 text-amber-400 shrink-0 opacity-60" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Legend */}
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
    </aside>
  )
}
