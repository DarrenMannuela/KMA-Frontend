import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './styles/globals.css'

// After an update, a tab that was open from before still asks for the old
// build's page chunks (each page is loaded on demand, see App.tsx), and
// those files are gone: opening another page would fail into the error
// screen. Vite reports that here; reload once to pick up the new build.
// The timestamp stops a reload loop if the files are missing for some
// other reason: then the error screen shows as before.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('kma-reloaded-for-update') || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('kma-reloaded-for-update', String(Date.now()))
  } catch {
    return // storage blocked: can't guard against a loop, so don't reload
  }
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {/* Outermost safety net, for errors outside the routes' own boundary; recovery
           is a reload. */}
        <ErrorBoundary fullPage>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
