import { useState } from 'react'
import { OperationsDashboard } from './OperationsDashboard'
import { OperationsSheetView } from './OperationSheetView'

export function OperationsPage() {
  const [view, setView] = useState<'dashboard' | 'sheet'>('dashboard')

  return view === 'dashboard'
    ? <OperationsDashboard onOpenSheet={() => setView('sheet')} />
    : <OperationsSheetView onBack={() => setView('dashboard')} />
}