import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Zap, AlertCircle, ChevronDown, LogOut, User as UserIcon } from 'lucide-react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthContext'

// The stub/live route banners below mention main.go and "wire the handler"
// — that's a message for whoever's building the backend, not for a real
// KMA staff member using the app day to day. Gate them the same way as the
// Sidebar's status dots so they vanish in a production build automatically.
const SHOW_DEV_STATUS = import.meta.env.DEV

const TITLES: Record<string, string> = {
  '/':                'Dashboard',
  '/clients':         'Clients',
  '/orders':          'Orders',
  '/items':           'Order Items',
  '/invoice':     'Invoice',
  '/delivery':        'Delivery',
  '/delivery-orders': 'Delivery Orders',
  '/surat-jalan':     'Surat Jalan',
  '/production':      'Production',
  '/suppliers':       'Suppliers',
  '/operations':      'Operations',
}

// Routes that are fully wired to real DB handlers in main.go
const LIVE_ROUTES = new Set(['/suppliers', '/orders', '/items', '/invoice',
  '/delivery', '/delivery-orders', '/surat-jalan',
  '/production', '/operations', '/clients',])

// Routes still returning stub JSON
const STUB_ROUTES = new Set()

function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
        className="flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full hover:bg-slate-100 transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-semibold">{initial}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-52 bg-white rounded-xl border border-slate-100 shadow-card py-1.5 z-40">
          {user?.email && (
            <div className="px-3.5 py-2 border-b border-slate-100 mb-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-navy-900 truncate">
                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {user.email}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'KMA'

  // Ping the dedicated health endpoint — deliberately not an
  // auth-gated route like /api/v1/supplier, so this reflects whether
  // the backend process is actually up, not whether the current
  // session happens to be valid right now.
  const { data: isUp } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get('/api/v1/healthz').then(() => true).catch(() => false),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const isStub = SHOW_DEV_STATUS && STUB_ROUTES.has(pathname)
  const isLive = SHOW_DEV_STATUS && LIVE_ROUTES.has(pathname)

  return (
    <header className="bg-white border-b border-slate-100 shrink-0">
      <div className="h-[60px] flex items-center justify-between px-6">
        <div>
          <h2 className="font-display font-semibold text-navy-900 text-base">{title}</h2>
          <p className="text-slate-400 text-xs font-mono">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Backend health */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isUp === true  ? 'bg-green-50 text-green-700' :
            isUp === false ? 'bg-red-50 text-red-600'    :
            'bg-slate-100 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isUp === true ? 'bg-green-500 animate-pulse' :
              isUp === false ? 'bg-red-500' : 'bg-slate-400'
            }`} />
            {isUp === true ? 'Backend live' : isUp === false ? 'Backend offline' : 'Connecting…'}
          </div>

          <button className="btn-ghost !px-2">
            <Bell className="w-4 h-4" />
          </button>

          <AccountMenu />
        </div>
      </div>

      {/* Route status banner */}
      {isStub && (
        <div className="flex items-center gap-2 px-6 py-1.5 bg-amber-50 border-b border-amber-100">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Stub route</span> — this endpoint returns placeholder JSON. Wire the handler in <code className="font-mono bg-amber-100 px-1 rounded">main.go</code> to enable full functionality.
          </p>
        </div>
      )}
      {isLive && (
        <div className="flex items-center gap-2 px-6 py-1.5 bg-green-50 border-b border-green-100">
          <Zap className="w-3.5 h-3.5 text-green-600 shrink-0" />
          <p className="text-xs text-green-700">
            <span className="font-semibold">Live</span> — this route is wired to the database.
          </p>
        </div>
      )}
    </header>
  )
}