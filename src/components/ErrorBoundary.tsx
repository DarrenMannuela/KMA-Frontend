import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import i18n from '@/i18n/config'

interface Props {
  children: ReactNode
  // Recover (remount) when any of these change, e.g. [location.pathname].
  resetKeys?: unknown[]
  // Swap in a smaller fallback for boundaries nested inside the page shell
  // (Sidebar/Topbar survive either way, since only the routed content below
  // is wrapped) — the default is sized for that inline case.
  fullPage?: boolean
}

interface State {
  error: Error | null
}

// Only a class component can implement getDerivedStateFromError /
// componentDidCatch — there's no hook equivalent, so this stays a class
// even though everything else in the codebase is function components.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && this.props.resetKeys?.some((key, i) => key !== prevProps.resetKeys?.[i])) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    // A class component can't use the hook; the shared instance follows the
    // same language setting.
    const t = i18n.t.bind(i18n)

    return (
      <div className={this.props.fullPage ? 'min-h-screen flex items-center justify-center bg-slate-100 px-4' : 'flex items-center justify-center py-24 px-4'}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">{t('errorScreen.title')}</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">{t('errorScreen.body')}</p>
          {/* Reloading a page that breaks every time just breaks again, so
             there's always a way back to the dashboard too. */}
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-primary btn-sm" onClick={() => window.location.reload()}>
              {t('errorScreen.reload')}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => window.location.assign('/')}>
              {t('errorScreen.home')}
            </button>
          </div>
          {/* What broke, to pass on when reporting it. */}
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-500">{t('errorScreen.details')}</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 select-all">{this.state.error.message || String(this.state.error)}</pre>
          </details>
        </div>
      </div>
    )
  }
}
