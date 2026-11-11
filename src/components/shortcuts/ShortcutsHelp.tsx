import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { MOD } from '@/utils/shortcuts'
import { Kbd } from './Kbd'

type Row = { keys: string[][]; label: string }

/** Every keyboard shortcut in the app, by where it works. Opened with ?. */
export function ShortcutsHelp({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const { t } = useTranslation()
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t('shortcuts.anywhere'),
      rows: [
        { keys: [[MOD, 'K']], label: t('shortcuts.jumpTo') },
        { keys: [[isAdmin ? '1–5' : '1–4']], label: t(isAdmin ? 'shortcuts.areasAdmin' : 'shortcuts.areas') },
        { keys: [['['], [']']], label: t('shortcuts.tabs') },
        { keys: [['?']], label: t('shortcuts.help') },
        { keys: [['Esc']], label: t('shortcuts.close') },
      ],
    },
    {
      title: t('shortcuts.lists'),
      rows: [
        { keys: [['/']], label: t('shortcuts.search') },
        { keys: [['N']], label: t('shortcuts.new') },
        { keys: [[MOD, 'Z']], label: t('shortcuts.undo') },
      ],
    },
    {
      title: t('shortcuts.tables'),
      rows: [
        { keys: [['↑'], ['↓'], ['←'], ['→']], label: t('shortcuts.move') },
        { keys: [['Enter'], ['F2']], label: t('shortcuts.edit') },
        { keys: [['A–Z']], label: t('shortcuts.typeToEdit') },
        { keys: [['Esc']], label: t('shortcuts.cancelEdit') },
        { keys: [['Tab']], label: t('shortcuts.tab') },
        { keys: [[MOD, 'V']], label: t('shortcuts.paste') },
      ],
    },
    {
      title: t('shortcuts.kasBon'),
      rows: [
        { keys: [['Shift', 'Space']], label: t('shortcuts.selectRow') },
        { keys: [['Delete']], label: t('shortcuts.deleteSelected') },
        { keys: [[MOD, 'Enter']], label: t('shortcuts.saveForm') },
      ],
    },
    {
      title: t('shortcuts.printing'),
      rows: [
        { keys: [['L']], label: t('shortcuts.layout') },
        { keys: [[MOD, 'P']], label: t('shortcuts.print') },
        { keys: [['Delete']], label: t('shortcuts.clearCell') },
      ],
    },
  ]

  return (
    <Modal title={t('shortcuts.title')} onClose={onClose} size="lg" guard={false}>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {sections.map(section => (
          <section key={section.title}>
            <h3 className="text-xs font-semibold text-navy-900 mb-2 dark:text-slate-100">{section.title}</h3>
            <dl className="space-y-1.5">
              {section.rows.map(row => (
                <div key={row.label} className="flex items-start justify-between gap-4">
                  <dt className="text-sm text-slate-600 dark:text-slate-300">{row.label}</dt>
                  <dd className="flex items-center gap-1 shrink-0">
                    {row.keys.map((combo, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="text-[11px] text-slate-400">/</span>}
                        <span className="flex items-center gap-0.5">{combo.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">{t('shortcuts.footnote')}</p>
    </Modal>
  )
}
