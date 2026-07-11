import { useState } from 'react'
import { ProductionDashboard } from './ProductionDashboard'
import { ProductionSheetView } from './ProductionSheetView'

type View = { mode: 'dashboard' } | { mode: 'sheet'; supplierId?: number }

// Controller only — swaps between the dashboard (bars + quick add) and the
// full spreadsheet as two separate screens, rather than stacking both on
// one page. Export name unchanged so App.tsx's import keeps working.
export function ProductionPage() {
  const [view, setView] = useState<View>({ mode: 'dashboard' })

  if (view.mode === 'sheet') {
    return <ProductionSheetView onBack={() => setView({ mode: 'dashboard' })} initialSupplierId={view.supplierId} />
  }

  return <ProductionDashboard onOpenSheet={(supplierId) => setView({ mode: 'sheet', supplierId })} />
}