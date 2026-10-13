import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Banknote, Factory, PiggyBank, Users, Wrench } from 'lucide-react'

const TABS = [
  { to: '/finance', label: 'Overview', icon: BarChart3, end: true },
  { to: '/production', label: 'Production', icon: Factory },
  { to: '/operations', label: 'Operations', icon: Wrench },
  { to: '/bukti-kas', label: 'Bukti Kas', icon: Banknote },
  { to: '/finance/budgets', label: 'Budgets & recurring', icon: PiggyBank },
  { to: '/suppliers', label: 'Suppliers', icon: Users },
]

/** The finance pages under one tab bar. */
export function FinanceSection() {
  return (
    <div>
      <nav className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-4 md:px-6" aria-label="Finance">
        <div className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-700 hover:border-slate-300'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
