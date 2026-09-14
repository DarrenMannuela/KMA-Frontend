import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  // Remount (and clear the caught error) whenever any value in this array
  // changes — e.g. pass [location.pathname] so navigating away from a page
  // that crashed on render recovers on its own instead of leaving the user
  // stuck on the fallback until a full reload.
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

    return (
      <div className={this.props.fullPage ? 'min-h-screen flex items-center justify-center bg-slate-100 px-4' : 'flex items-center justify-center py-24 px-4'}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Something went wrong</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            This page hit an unexpected error. Your data is safe — try reloading.
          </p>
          <button className="btn-primary btn-sm" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
