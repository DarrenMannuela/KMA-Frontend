import { useState } from 'react'
import { ProductionDashboard } from './ProductionDashboard'
import { ProductionSheetView } from './ProductionSheetView'

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

  const openSheet = (supplierId?: number) => {
    setLastSupplierId(supplierId)
    setView({ mode: 'sheet', supplierId })
  }

  if (view.mode === 'sheet') {
    return <ProductionSheetView onBack={() => setView({ mode: 'dashboard' })} initialSupplierId={view.supplierId} />
  }

  return <ProductionDashboard onOpenSheet={openSheet} selectedSupplierId={lastSupplierId} />
}