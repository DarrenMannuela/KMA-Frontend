import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

// On mobile this renders as a bottom sheet (slides up, anchored to the
// screen's bottom edge, rounded top corners only) instead of a centered
// dialog — the native-mobile-app pattern, and reachable with a thumb
// without having to stretch to the middle of the screen the way a
// centered popup demands. Every existing <Modal> call site gets this for
// free since they all render through here — nothing about the call sites
// themselves needed to change. Desktop is untouched: same centered
// dialog as before, at every size.
export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const isMobile = useIsMobile()

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end bg-navy-950/30 backdrop-blur-sm fade-in"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white w-full rounded-t-3xl shadow-2xl slide-up flex flex-col max-h-[88vh]">
          {/* Purely a visual affordance (no swipe-to-dismiss gesture wired
              up) — signals "this sheet" the way a native one would, so it
              doesn't read as a dialog that got stuck to the bottom edge
              by accident. Tap-the-backdrop and the explicit X below both
              still work as the real close actions. */}
          <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
            <div className="w-9 h-1 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-center justify-between px-5 pb-3 shrink-0">
            <h3 className="font-display font-semibold text-navy-900 text-base">{title}</h3>
            <button className="btn-ghost !px-2 !py-1.5" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-5 pb-6">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/50 backdrop-blur-sm fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white w-full ${sizes[size]} rounded-2xl shadow-2xl fade-up flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-display font-semibold text-navy-900 text-base">{title}</h3>
          <button className="btn-ghost !px-2 !py-1.5" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
