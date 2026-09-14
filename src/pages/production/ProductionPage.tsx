import { useState } from 'react'
import { ProductionDashboard } from './ProductionDashboard'
import { ProductionSheetView } from './ProductionsSheetView'

type View = { mode: 'dashboard' } | { mode: 'sheet'; supplierId?: number }

// Controller only — swaps between the dashboard (bars + quick add) and the
// full spreadsheet as two separate screens, rather than stacking both on
// one page. Export name unchanged so App.tsx's import keeps working.
export function ProductionPage() {
  const [view, setView] = useState<View>({ mode: 'dashboard' })
  // Kept separately from `view` so the dashboard's supplier-bar highlight
  // survives a round trip to the spreadsheet and back — without this, going
  // dashboard -> click supplier -> sheet -> back leaves the bars with no
  // memory of which supplier was active, which reads as "did my click even
  // register?" on return.
  const [lastSupplierId, setLastSupplierId] = useState<number | undefined>(undefined)
  // Same idea, for the month being viewed — previously each screen kept its
  // own independent cursor defaulting to "today," so browsing to a past
  // month on the dashboard and then clicking "Open full spreadsheet" (or a
  // supplier bar) silently dropped back to the current month on the sheet,
  // showing an empty "New entries" table even though the month you were
  // just looking at had real data. Lifted up here so both screens read/
  // write the same cursor and a round trip preserves whatever month you
  // were on.
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const openSheet = (supplierId?: number) => {
    setLastSupplierId(supplierId)
    setView({ mode: 'sheet', supplierId })
  }

  if (view.mode === 'sheet') {
    return (
      <ProductionSheetView
        onBack={() => setView({ mode: 'dashboard' })}
        initialSupplierId={view.supplierId}
        cursor={cursor}
        onCursorChange={(year, month) => setCursor({ year, month })}
      />
    )
  }

  return (
    <ProductionDashboard
      onOpenSheet={openSheet}
      selectedSupplierId={lastSupplierId}
      cursor={cursor}
      onCursorChange={(year, month) => setCursor({ year, month })}
    />
  )
}