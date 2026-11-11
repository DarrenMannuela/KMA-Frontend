import { BarChart3, Banknote, Factory, PiggyBank, Users, Wrench } from 'lucide-react'
import { SectionTabs, type SectionTab } from '@/components/layout/SectionTabs'

const TABS: SectionTab[] = [
  { to: '/finance', labelKey: 'financeTabs.overview', icon: BarChart3, end: true },
  { to: '/production', labelKey: 'common.production', icon: Factory },
  { to: '/operations', labelKey: 'common.operations', icon: Wrench },
  { to: '/bukti-kas', labelKey: 'topbar.titles.buktiKas', icon: Banknote },
  { to: '/finance/budgets', labelKey: 'financeTabs.budgets', icon: PiggyBank },
  { to: '/suppliers', labelKey: 'topbar.titles.suppliers', icon: Users },
]

/** The finance pages under one tab bar. */
export function FinanceSection() {
  return <SectionTabs tabs={TABS} labelKey="sidebar.financeGroup" sheetTitleKey="financeTabs.sectionTitle" />
}
