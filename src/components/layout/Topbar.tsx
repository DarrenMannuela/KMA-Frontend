import { useLocation } from 'react-router-dom'
import { Bell, Zap, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const TITLES: Record<string, string> = {
  '/':                'Dashboard',
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
  '/production', '/operations',])

// Routes still returning stub JSON
const STUB_ROUTES = new Set()

export function Topbar() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'KMA'

  // Ping the supplier endpoint to check if backend is up
  const { data: isUp } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get('/api/v1/supplier').then(() => true).catch(() => false),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const isStub = STUB_ROUTES.has(pathname)
  const isLive = LIVE_ROUTES.has(pathname)

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
          <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">A</span>
          </div>
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
