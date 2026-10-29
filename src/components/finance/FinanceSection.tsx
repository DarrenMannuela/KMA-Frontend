import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Banknote, Factory, PiggyBank, Users, Wrench, ChevronDown, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FinanceTab { to: string; label: string; icon: LucideIcon; end?: boolean }

const TABS: FinanceTab[] = [
  { to: '/finance', label: 'Overview', icon: BarChart3, end: true },
  { to: '/production', label: 'Production', icon: Factory },
  { to: '/operations', label: 'Operations', icon: Wrench },
  { to: '/bukti-kas', label: 'Bukti Kas', icon: Banknote },
  { to: '/finance/budgets', label: 'Budgets & recurring', icon: PiggyBank },
  { to: '/suppliers', label: 'Suppliers', icon: Users },
]

function isTabActive(pathname: string, tab: FinanceTab) {
  return tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
}

/** The finance pages under one tab bar. Once docked (`dock:` — see tailwind
 *  config), that's a normal horizontal tab row; below it, a single
 *  tap-to-pick control opens the full list instead — a blind left/right
 *  swipe was the only way to reach "Budgets & recurring" or "Suppliers",
 *  which sat past the visible edge with nothing hinting they were there. */
export function FinanceSection() {
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = TABS.find(t => isTabActive(location.pathname, t)) ?? TABS[0]
  const ActiveIcon = active.icon

  return (
    <div>
      <nav className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 dark:bg-navy-950/95 dark:border-navy-700" aria-label="Finance">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="dock:hidden w-full flex items-center gap-2.5 px-4 py-3.5 text-sm font-medium text-navy-900 dark:text-slate-50"
        >
          <ActiveIcon className="w-4 h-4 text-navy-500 dark:text-navy-300 shrink-0" />
          {active.label}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
        </button>

        <div className="hidden dock:flex gap-1 overflow-x-auto -mb-px px-6">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? 'border-navy-900 text-navy-900 dark:text-slate-50' : 'border-transparent text-slate-500 hover:text-navy-700 hover:border-slate-300 dark:text-slate-400'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Section picker — bottom sheet, same language as Modal/ConfirmDialog.
         z-50 + dock:hidden: never relevant once docked, and even a live
         resize from phone to desktop mid-open can't leave it stranded. */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end dock:hidden bg-navy-950/30 backdrop-blur-sm fade-in"
          onClick={e => e.target === e.currentTarget && setSheetOpen(false)}
        >
          <div className="bg-white w-full rounded-t-3xl shadow-2xl slide-up dark:bg-navy-900">
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-slate-200 dark:bg-navy-700" />
            </div>
            <p className="px-5 pt-1.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Finance section
            </p>
            <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {TABS.map(tab => {
                const tabActive = tab === active
                const TabIcon = tab.icon
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.end}
                    onClick={() => setSheetOpen(false)}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium ${
                      tabActive ? 'text-navy-900 bg-slate-50 dark:text-slate-50 dark:bg-white/5' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <TabIcon className="w-4 h-4 shrink-0" />
                    {tab.label}
                    {tabActive && <Check className="w-4 h-4 ml-auto shrink-0 text-navy-700 dark:text-slate-200" />}
                  </NavLink>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <Outlet />
    </div>
  )
}
