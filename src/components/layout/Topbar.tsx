import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Zap, AlertCircle, ChevronDown, LogOut, User as UserIcon, KeyRound, ShieldCheck, Menu, Languages, Sun, Moon } from 'lucide-react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/i18n/dateLocale'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

// The stub/live route banners are for development builds only.
const SHOW_DEV_STATUS = import.meta.env.DEV

const TITLE_KEYS: Record<string, string> = {
  '/':                'topbar.titles.dashboard',
  '/clients':         'topbar.titles.clients',
  '/orders':          'topbar.titles.orders',
  '/items':           'topbar.titles.items',
  '/invoice':     'topbar.titles.invoice',
  '/delivery':        'topbar.titles.delivery',
  '/delivery-orders': 'topbar.titles.deliveryOrders',
  '/surat-jalan':     'topbar.titles.suratJalan',
  '/production':      'topbar.titles.production',
  '/suppliers':       'topbar.titles.suppliers',
  '/operations':      'topbar.titles.operations',
  '/finance':         'topbar.titles.finance',
  '/admin/users':     'topbar.titles.users',
}

// Longest matching prefix, so detail routes (/orders/:id) get their section's title key.
function titleKeyFor(pathname: string): string | null {
  let best: string | null = null
  for (const path of Object.keys(TITLE_KEYS)) {
    if ((pathname === path || pathname.startsWith(`${path}/`)) && (best === null || path.length > best.length)) {
      best = path
    }
  }
  return best ? TITLE_KEYS[best] : null
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  return (
    <button
      className="btn-ghost !px-2"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('topbar.switchToLight') : t('topbar.switchToDark')}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}

// Routes that are fully wired to real DB handlers in main.go
const LIVE_ROUTES = new Set(['/suppliers', '/orders', '/items', '/invoice',
  '/delivery', '/delivery-orders', '/surat-jalan',
  '/production', '/operations', '/clients', '/finance',])

// Routes still returning stub JSON
const STUB_ROUTES = new Set()

function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nextLang = i18n.resolvedLanguage?.startsWith('id') ? 'en' : 'id'
  const nextLangLabel = nextLang === 'id' ? t('common.languageIndonesian') : t('common.languageEnglish')

  // Close on outside click — a dropdown that only closes when you pick
  // an item (or never) is worse than no dropdown.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initial = user?.email?.[0]?.toUpperCase() ?? 'A'

  async function handleLogout() {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-semibold">{initial}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-52 bg-white rounded-xl border border-slate-100 shadow-card py-1.5 z-40 dark:bg-navy-900 dark:border-navy-800">
          {user?.email && (
            <div className="px-3.5 py-2 border-b border-slate-100 mb-1 dark:border-navy-800">
              <p className="flex items-center gap-1.5 text-xs font-medium text-navy-900 truncate dark:text-slate-100">
                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {user.email}
              </p>
            </div>
          )}
          <button
            onClick={() => {
              i18n.changeLanguage(nextLang)
              setOpen(false)
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-navy-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Languages className="w-4 h-4" />
            {t('common.switchToLanguage', { language: nextLangLabel })}
          </button>
          {/* No handler yet — there's nothing to show here until actual
              notifications exist (see the overdue-invoices idea). A dead
              button in the always-visible topbar row was worse than this:
              listed honestly as not-yet-live, tucked in the menu instead of
              competing for primary-bar space it wasn't earning. */}
          <div
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-slate-400 dark:text-slate-600 cursor-default"
          >
            <Bell className="w-4 h-4" />
            <span className="flex-1 text-left">{t('topbar.notifications')}</span>
            <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-300 dark:text-slate-700">{t('topbar.comingSoon')}</span>
          </div>
          <div className="border-t border-slate-100 my-1 dark:border-navy-800" />
          <button
            onClick={() => {
              setOpen(false)
              navigate('/change-password')
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-navy-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
          >
            <KeyRound className="w-4 h-4" />
            {t('topbar.changePassword')}
          </button>
          <button
            onClick={() => {
              setOpen(false)
              navigate('/two-factor')
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-navy-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
          >
            <ShieldCheck className="w-4 h-4" />
            {t('topbar.twoFactor')}
            {user?.totp_enabled && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            {t('topbar.logOut')}
          </button>
        </div>
      )}
    </div>
  )
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const titleKey = titleKeyFor(pathname)
  const title = titleKey ? t(titleKey) : t('common.appName')

  // The unauthenticated health endpoint: is the backend up at all.
  const { data: isUp } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get('/api/v1/healthz').then(() => true).catch(() => false),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const isStub = SHOW_DEV_STATUS && STUB_ROUTES.has(pathname)
  const isLive = SHOW_DEV_STATUS && LIVE_ROUTES.has(pathname)

  return (
    <header className="bg-white border-b border-slate-100 shrink-0 dark:bg-navy-900 dark:border-navy-800">
      <div className="h-[60px] flex items-center justify-between px-4 sm:px-6 gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Opens the Sidebar's mobile drawer — dock:hidden because the
              sidebar is permanently visible once docked (see tailwind
              config's `dock` screen), where this button would have nothing
              to do. Plain `md:` isn't enough here: a phone in landscape can
              exceed 768px of width while still being far too short for a
              permanent sidebar. */}
          {/* A full 44px tap target, not just the icon's own size — the one
              control that opens the entire nav on mobile is worth the extra
              padding so a slightly-off tap still lands. */}
          <button onClick={onMenuClick} className="dock:hidden btn-ghost !p-3.5 shrink-0" title={t('topbar.openMenu')}>
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-navy-900 text-base truncate dark:text-slate-50">{title}</h2>
            <p className="text-slate-500 text-xs font-mono truncate dark:text-slate-400">
              {/* Short on phones, where the full date was cut off. */}
              <span className="sm:hidden">{format(new Date(), 'EEE, d MMM yyyy', { locale: dateLocale })}</span>
              <span className="hidden sm:inline">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale })}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Below sm only the dot shows. */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isUp === true  ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' :
            isUp === false ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'    :
            'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isUp === true ? 'bg-green-500 animate-pulse' :
              isUp === false ? 'bg-red-500' : 'bg-slate-400'
            }`} />
            <span className="hidden sm:inline">
              {isUp === true ? t('topbar.backendLive') : isUp === false ? t('topbar.backendOffline') : t('topbar.connecting')}
            </span>
          </div>

          <ThemeToggle />

          <AccountMenu />
        </div>
      </div>

      {/* Route status banner */}
      {isStub && (
        <div className="flex items-center gap-2 px-6 py-1.5 bg-amber-50 border-b border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">Stub route</span> — this endpoint returns placeholder JSON. Wire the handler in <code className="font-mono bg-amber-100 px-1 rounded dark:bg-amber-500/20">main.go</code> to enable full functionality.
          </p>
        </div>
      )}
      {isLive && (
        <div className="flex items-center gap-2 px-6 py-1.5 bg-green-50 border-b border-green-100 dark:bg-green-500/10 dark:border-green-500/20">
          <Zap className="w-3.5 h-3.5 text-green-600 shrink-0 dark:text-green-400" />
          <p className="text-xs text-green-700 dark:text-green-400">
            <span className="font-semibold">Live</span> — this route is wired to the database.
          </p>
        </div>
      )}
    </header>
  )
}