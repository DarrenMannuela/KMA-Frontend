export function SettingsPage() {
  return (
    <div className="flex-1 p-8">
      <div className="max-w-lg animate-fade-up">
        <h2 className="font-display text-3xl font-bold text-ink-900 mb-2">Settings</h2>
        <p className="font-body text-ink-400 text-sm mb-8">Configure your KMA instance</p>

        <div className="card p-6 mb-4">
          <h3 className="font-display font-semibold text-ink-900 mb-1">API Endpoint</h3>
          <p className="font-body text-sm text-ink-500 mb-3">
            The frontend proxies requests to <code className="font-mono text-xs bg-parchment px-1 py-0.5 rounded">/api</code> via Vite dev proxy (→ <code className="font-mono text-xs bg-parchment px-1 py-0.5 rounded">localhost:8080</code>).
            In production, set your reverse proxy or update <code className="font-mono text-xs bg-parchment px-1 py-0.5 rounded">VITE_API_BASE</code>.
          </p>
          <div className="input-field bg-parchment font-mono text-sm text-ink-500 cursor-default">
            http://localhost:8080/api
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display font-semibold text-ink-900 mb-1">About KMA</h3>
          <p className="font-body text-sm text-ink-500">
            KMA is a personal knowledge management system. Backend built with Go + Gin + GORM + SQLite.
            Frontend built with React + TypeScript + Vite + Tailwind CSS.
          </p>
        </div>
      </div>
    </div>
  )
}
