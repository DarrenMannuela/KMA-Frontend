import { useState } from 'react'
import { OperationsDashboard } from './OperationsDashboard'
import { OperationsSheetView } from './OperationsSheetView'

type View = { mode: 'dashboard' } | { mode: 'sheet'; category?: string }

// Controller only — swaps between the dashboard (bars + quick add) and the
// full spreadsheet as two separate screens, mirroring ProductionPage.
export function OperationsPage() {
  const [view, setView] = useState<View>({ mode: 'dashboard' })
  // Kept separately from `view` so the dashboard's category-bar highlight
  // survives a round trip to the spreadsheet and back — without this, going
  // dashboard -> click category -> sheet -> back leaves the bars with no
  // memory of which one was active, which reads as "did my click even
  // register?" on return.
  const [lastCategory, setLastCategory] = useState<string | undefined>(undefined)
  // Same idea, for the month being viewed — see ProductionPage's identical
  // fix and comment. Previously each screen kept its own cursor defaulting
  // to "today," so browsing to a past month on the dashboard and then
  // opening the spreadsheet silently dropped back to the current month,
  // showing an empty sheet even though the month you were just looking at
  // had real entries.
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const openSheet = (category?: string) => {
    setLastCategory(category)
    setView({ mode: 'sheet', category })
  }

  if (view.mode === 'sheet') {
    return (
      <OperationsSheetView
        onBack={() => setView({ mode: 'dashboard' })}
        initialCategory={view.category}
        cursor={cursor}
        onCursorChange={(year, month) => setCursor({ year, month })}
      />
    )
  }

  return (
    <OperationsDashboard
      onOpenSheet={openSheet}
      selectedCategory={lastCategory}
      cursor={cursor}
      onCursorChange={(year, month) => setCursor({ year, month })}
    />
  )
}