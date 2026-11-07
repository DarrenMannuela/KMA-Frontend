import { createElement } from 'react'
import toast from 'react-hot-toast'
import i18n from '@/i18n/config'

/** The success toast that carries an Undo button. It is the one place this
 *  looks the same everywhere: gold on the dark toast so it reads at a
 *  glance, and a real tap target, since this is the button people reach for
 *  right after a mistake. */
export function undoToast(label: string, onUndo: () => void) {
  toast.success(t => createElement('span', { className: 'flex items-center gap-2' },
    createElement('span', null, label),
    createElement('button', {
      type: 'button',
      className: 'shrink-0 -my-1.5 -mr-1 min-h-8 px-3 rounded-md font-semibold text-gold-400 underline underline-offset-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400',
      onClick: () => { toast.dismiss(t.id); onUndo() },
    }, i18n.t('common.undo')),
  ), { duration: 8000 })
}

/** The messages around an undo, shared by every undo stack. */
export const undoMessages = {
  nothing: () => toast(i18n.t('common.nothingToUndo')),
  done: (label: string) => toast.success(i18n.t('common.undone', { label })),
  failed: (e: unknown) => toast.error(i18n.t('common.couldntUndo', { message: (e as Error).message })),
}
