import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

export interface SectionTab { to: string; labelKey: string; icon: LucideIcon; end?: boolean }

function isTabActive(pathname: string, tab: SectionTab) {
  return tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
}

/** A section's pages under one tab bar (Orders, Finance), reached from a
 *  single sidebar link. Once docked (`dock:` — see tailwind config), that's
 *  a normal horizontal tab row, stuck to the top. On a phone every page is
 *  on show at once, as a grid of compact tiles (icon and name, the current
 *  one filled; kept short so the page's own content starts sooner) that
 *  scrolls away with the page: a single "current page ▾"
 *  picker hid the others behind a tap, and a sideways-scrolling row hid
 *  them past the edge. Detail pages (an order, a client) keep their
 *  section's tab lit. */
export function SectionTabs({ tabs: TABS, labelKey }: { tabs: SectionTab[]; labelKey: string; sheetTitleKey?: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  // Up to four in one row; more go three to a row (six = two rows).
  const cols = TABS.length <= 4 ? TABS.length : 3

  return (
    <div>
      <nav className="dock:sticky dock:top-0 dock:z-30 dock:bg-slate-50/95 dock:backdrop-blur dock:border-b dock:border-slate-200 dark:dock:bg-navy-950/95 dark:dock:border-navy-700" aria-label={t(labelKey)}>
        <div className="dock:hidden px-4 pt-4">
          <div className="grid gap-1 rounded-2xl border border-slate-200 bg-white p-1 dark:border-navy-800 dark:bg-navy-900" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = isTabActive(location.pathname, tab)
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] px-1.5 py-1.5 rounded-xl text-center text-xs font-medium leading-tight transition-colors ${
                    active
                      ? 'bg-navy-900 text-white dark:bg-gold-500 dark:text-navy-950'
                      : 'text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-white/5'
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? '' : 'text-navy-500 dark:text-navy-300'}`} aria-hidden />
                  <span className="break-words">{t(tab.labelKey)}</span>
                </NavLink>
              )
            })}
          </div>
        </div>

        {/* data-kbd: [ and ] step through these tabs (KeyboardShortcuts). */}
        <div data-kbd="tabs" className="hidden dock:flex gap-1 overflow-x-auto -mb-px px-6">
          {TABS.map(({ to, labelKey, icon: Icon, end }) => (
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
              {t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  )
}
