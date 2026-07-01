import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, ListOrdered, FileText,
  Truck, PackageCheck, ScrollText, Factory, Users, Wrench,
  Circle, ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type RouteStatus = 'live' | 'stub'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  status?: RouteStatus
}

interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const STANDALONE: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Delivery', path: '/delivery', icon: Truck, status: 'live' },
]

const GROUPS: NavGroup[] = [
  {
    label: 'Orders',
    icon: ShoppingBag,
    items: [
      { label: 'Orders',      path: '/orders',      icon: ShoppingBag, status: 'live' },
      { label: 'Order Items', path: '/items',        icon: ListOrdered, status: 'live' },
      { label: 'Invoice', path: '/invoice',  icon: FileText,    status: 'live' },
    ],
  },
  {
    label: 'Finances',
    icon: Factory,
    items: [
      { label: 'Production', path: '/production', icon: Factory, status: 'live' },
      { label: 'Suppliers',  path: '/suppliers',  icon: Users,   status: 'live' },
      { label: 'Operations', path: '/operations', icon: Wrench,  status: 'live' },
    ],
  },
]

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
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
          <span className="flex-1">{item.label}</span>
          {item.status === 'live' && <Circle className="w-2 h-2 fill-green-400 text-green-400 shrink-0" />}
          {item.status === 'stub' && <Circle className="w-2 h-2 fill-amber-400 text-amber-400 shrink-0 opacity-60" />}
        </>
      )}
    </NavLink>
  )
}

function NavGroupSection({ group }: { group: NavGroup }) {
  const location = useLocation()
  const isAnyActive = group.items.some(i => location.pathname.startsWith(i.path) && i.path !== '/')
  const [open, setOpen] = useState(isAnyActive)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-navy-300 hover:bg-white/5 hover:text-white transition-all duration-150 group"
      >
        <group.icon className="w-4 h-4 shrink-0 text-navy-400 group-hover:text-navy-200" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-navy-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="ml-3 pl-3 border-l border-navy-800 mt-0.5 space-y-0.5">
          {group.items.map(item => (
            <NavItemLink key={item.path} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[240px] bg-navy-950 sidebar-pattern flex flex-col z-30 shadow-sidebar">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-navy-800">
        <div className="flex items-center gap-3">
            <img src="/Logo.png" alt="KMA" className="w-9 h-9 rounded-xl object-contain shrink-0" />
          <div>
            <p className="font-display font-bold text-white text-sm leading-tight">KMA</p>
            <p className="text-navy-400 text-[10px] font-mono leading-tight">Kreasi Makmur Abadi</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {/* Dashboard first */}
        <NavItemLink item={STANDALONE[0]} />

        <div className="pt-2 space-y-0.5">
          {/* Orders group */}
          <NavGroupSection group={GROUPS[0]} />

          {/* Delivery standalone, after Orders */}
          <NavItemLink item={STANDALONE[1]} />

          {/* Finances group */}
          <NavGroupSection group={GROUPS[1]} />
        </div>
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