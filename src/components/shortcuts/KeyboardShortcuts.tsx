import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { anyDialogOpen } from '@/hooks/useDialog'
import { isTyping } from '@/utils/isTyping'
import { findMarked, inCell } from '@/utils/shortcuts'
import { JumpTo } from './JumpTo'
import { ShortcutsHelp } from './ShortcutsHelp'

// The sidebar's areas, in its order: 1 to 4 (5, Users, for admins).
const AREAS = ['/', '/orders', '/delivery', '/finance', '/admin/users']

/** The app-wide keyboard shortcuts, once signed in:
 *  - Ctrl+K / ⌘K: Jump to (any page, order, invoice, client, delivery);
 *  - 1–4 (5): the sidebar's areas; [ and ]: the area's previous/next tab;
 *  - / : the page's search box; N: the page's Add / New button;
 *  - L: a print page's Layout panel; ?: the list of shortcuts.
 *  Pages mark their search box, New button, tab bar and Layout button with
 *  data-kbd, so one handler serves them all. A page that handles a key itself
 *  (the Kas Bon ledger's N, say) prevents it, and this leaves it alone; so it
 *  does while typing, while a table cell has focus (typing there starts an
 *  edit), and while a dialog is open. */
export function KeyboardShortcuts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [jumpOpen, setJumpOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const signedIn = !!user

  useEffect(() => {
    if (!signedIn) return
    const openJump = () => { setHelpOpen(false); setJumpOpen(true) }
    const openHelp = () => { setJumpOpen(false); setHelpOpen(true) }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      // Jump to works from anywhere, a text field included, but not over a dialog.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        if (anyDialogOpen()) return
        e.preventDefault()
        openJump()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (anyDialogOpen() || isTyping(e.target) || inCell(document.activeElement)) return

      const key = e.key
      if (key === '?') { e.preventDefault(); openHelp(); return }
      if (e.shiftKey) return

      const area = /^[1-5]$/.test(key) ? AREAS[Number(key) - 1] : undefined
      if (area) {
        if (area === '/admin/users' && !isAdmin) return
        e.preventDefault()
        navigate(area)
        return
      }
      if (key === '[' || key === ']') {
        const links = [...(document.querySelector('[data-kbd="tabs"]')?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]
        if (!links.length) return
        const current = links.findIndex(a => a.getAttribute('aria-current') === 'page')
        const next = links[(current + (key === ']' ? 1 : -1) + links.length) % links.length]
        e.preventDefault()
        next.click()
        return
      }
      const target =
        key === '/' ? findMarked('search') :
        key.toLowerCase() === 'n' ? findMarked('new') :
        key.toLowerCase() === 'l' ? findMarked('layout') : null
      if (!target || (target instanceof HTMLButtonElement && target.disabled)) return
      e.preventDefault()
      if (key === '/') { target.focus(); if (target instanceof HTMLInputElement) target.select() }
      else target.click()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('kma:jump-to', openJump)
    window.addEventListener('kma:shortcuts-help', openHelp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('kma:jump-to', openJump)
      window.removeEventListener('kma:shortcuts-help', openHelp)
    }
  }, [signedIn, isAdmin, navigate])

  if (!signedIn) return null
  return (
    <>
      {jumpOpen && <JumpTo onClose={() => setJumpOpen(false)} onShowShortcuts={() => setHelpOpen(true)} isAdmin={isAdmin} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} isAdmin={isAdmin} />}
    </>
  )
}
