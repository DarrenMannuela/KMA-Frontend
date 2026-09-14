import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {/* Outermost safety net — catches anything that escapes App itself
            (e.g. AuthProvider or the router chrome), which the route-scoped
            boundary inside AppShell can't see since it sits below both.
            No resetKeys here on purpose: there's nothing "outside" this one
            to navigate to, so recovery is a reload, same as the fallback UI
            says. */}
        <ErrorBoundary fullPage>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
