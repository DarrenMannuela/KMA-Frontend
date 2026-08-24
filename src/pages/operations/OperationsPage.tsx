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

  const openSheet = (category?: string) => {
    setLastCategory(category)
    setView({ mode: 'sheet', category })
  }

  if (view.mode === 'sheet') {
    return <OperationsSheetView onBack={() => setView({ mode: 'dashboard' })} initialCategory={view.category} />
  }

  return <OperationsDashboard onOpenSheet={openSheet} selectedCategory={lastCategory} />
}