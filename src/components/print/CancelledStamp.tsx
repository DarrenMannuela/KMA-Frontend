import { useTranslation } from 'react-i18next'

/** A large rubber-stamp "DIBATALKAN" across a printed document whose invoice
 *  was cancelled with its order, on screen and on paper, so a copy that
 *  goes out by mistake can't be taken for a live bill. Its parent must be
 *  position: relative. */
export function CancelledStamp({ show }: { show: boolean }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-[38%] overflow-hidden">
      <span
        className="-rotate-[18deg] border-[6px] border-red-600/70 text-red-600/70 rounded-lg px-8 py-2 font-black tracking-[0.18em] uppercase"
        style={{ fontSize: '64px', lineHeight: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      >
        {t('printStamp.cancelled')}
      </span>
    </div>
  )
}
