import { readCsrfCookie } from '@/api/authApi'

// ─────────────────────────────────────────────────────────────────────────────
// Logging out when KMA is closed.
//
// Closing the last KMA tab or window (or the browser, or the installed app)
// ends the session; closing one of several tabs, or reloading, doesn't.
//
// A page can't tell a close from a reload, and phones often give no warning,
// so this works at both ends:
// - On `pagehide` a tab reports it's closing (POST /closing): the session
//   then runs out in 20 seconds unless used again. A reload uses it at once
//   (and again 2s in); other open tabs hear of the close on a
//   BroadcastChannel and use it too.
// - On opening, a sessionStorage mark (TAB_KEY) means this tab was signed in
//   during this visit; without one, the tab asks the others. Browsers that
//   restore tabs also restore that mark, so open tabs note the time in
//   localStorage every 30s (ALIVE_KEY): a mark over 2 minutes stale means
//   KMA was closed in between.
// If KMA was closed, a leftover session is ended on the server and the login
// screen shows.
// ─────────────────────────────────────────────────────────────────────────────

const TAB_KEY = 'kma-signed-in-tab'
const ALIVE_KEY = 'kma-open-at'
const CHANNEL = 'kma-tabs'
const AUTH = '/auth/api/v1/auth'
const HEARTBEAT_MS = 30_000
// Background tabs may only run timers once a minute, so this has to be
// comfortably more than that, or a merely hidden tab would look closed.
const CLOSED_AFTER_MS = 2 * 60_000
const ASK_FOR_MS = 300
// How long after a "closing" to use the session again. Must be well
// inside the auth service's grace (20s, closingGrace in auth_handler.go),
// and long enough that the closing request has surely arrived first.
const KEEP_AFTER_CLOSE_MS = 2_000

type Message = { type: 'anyone-open?' } | { type: 'open-here' } | { type: 'closing' }

let channel: BroadcastChannel | null = null
let heartbeat: number | undefined
let visit: Promise<boolean> | null = null

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // storage blocked or full: the check just falls back to asking other tabs
  }
}

const session = () => window.sessionStorage
const local = () => window.localStorage

function noteOpen() {
  write(local, ALIVE_KEY, String(Date.now()))
}

function openChannel(): BroadcastChannel | null {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
  }
  return channel
}

// Uses the session, which slides its idle expiry back out (undoing a
// "closing" from a tab that has gone). Plain fetch rather than authHttp,
// so a 401 (the session had ended) doesn't reload the page from here.
function keepSession() {
  fetch(`${AUTH}/me`, { credentials: 'same-origin' }).catch(() => {})
}

function keepSessionSoon() {
  window.setTimeout(keepSession, KEEP_AFTER_CLOSE_MS)
}

// Asks the other KMA tabs in this browser whether one of them is signed
// in and open right now.
function anotherTabIsOpen(): Promise<boolean> {
  const ch = openChannel()
  if (!ch) return Promise.resolve(false)
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<Message>) => {
      if (e.data?.type === 'open-here') finish(true)
    }
    const timer = window.setTimeout(() => finish(false), ASK_FOR_MS)
    function finish(open: boolean) {
      window.clearTimeout(timer)
      ch!.removeEventListener('message', onMessage)
      resolve(open)
    }
    ch.addEventListener('message', onMessage)
    ch.postMessage({ type: 'anyone-open?' } satisfies Message)
  })
}

// What a signed-in tab does when another KMA tab speaks.
function onTabMessage(e: MessageEvent<Message>) {
  if (e.data?.type === 'anyone-open?') {
    channel?.postMessage({ type: 'open-here' } satisfies Message)
  } else if (e.data?.type === 'closing') {
    keepSessionSoon() // that tab went, this one is still here
  }
}

// The tab is going away (closed, reloaded, or navigated off KMA). keepalive
// lets the request finish after the page itself is gone.
function onPageHide() {
  noteOpen()
  channel?.postMessage({ type: 'closing' } satisfies Message)
  const csrf = readCsrfCookie()
  if (!csrf) return
  fetch(`${AUTH}/closing`, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  }).catch(() => {})
}

// The browser brought the page back from its back/forward cache (it was
// kept whole, not reloaded): use the session at once, before the closing
// it reported when it was put away makes it run out.
function onPageShow(e: PageTransitionEvent) {
  if (e.persisted) keepSession()
}

// Marks this tab as signed in for the rest of this visit: it survives
// reloads, answers new tabs, keeps noting that KMA is open, and reports
// when it closes. Call it after a login, and when the visit is found to
// be still open.
export function markTabSignedIn() {
  write(session, TAB_KEY, '1')
  visit = Promise.resolve(true)
  noteOpen()
  if (heartbeat === undefined) {
    heartbeat = window.setInterval(noteOpen, HEARTBEAT_MS)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    openChannel()?.addEventListener('message', onTabMessage)
  }
}

// After a logout: this tab is no longer part of a signed-in visit.
export function forgetTab() {
  write(session, TAB_KEY, null)
  if (heartbeat !== undefined) {
    window.clearInterval(heartbeat)
    heartbeat = undefined
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    channel?.removeEventListener('message', onTabMessage)
  }
}

// Whether this page load continues a visit that's still open (a reload,
// or another KMA tab is open), as opposed to KMA being opened afresh
// after it was closed. Worked out once per page load.
export function visitIsStillOpen(): Promise<boolean> {
  if (!visit) {
    visit = (async () => {
      const marked = read(session, TAB_KEY) === '1'
      const openAt = Number(read(local, ALIVE_KEY) || 0)
      if ((marked && Date.now() - openAt < CLOSED_AFTER_MS) || (await anotherTabIsOpen())) {
        markTabSignedIn()
        // This page's first request may have reached the auth service
        // before the "closing" its previous page sent while reloading.
        keepSessionSoon()
        return true
      }
      write(session, TAB_KEY, null)
      return false
    })()
  }
  return visit
}

// Ends the session left over from before KMA was closed, on the server,
// so its cookie can't be used again. Plain fetch rather than authHttp: a
// 401 here (the session had already run out) is expected, and authHttp
// would answer it by reloading the page. Best effort: if the auth service
// can't be reached, the login screen still shows; the old session then
// runs out by itself.
export async function endClosedSession(): Promise<void> {
  const csrf = readCsrfCookie()
  if (!csrf) return // no session was left
  try {
    await fetch(`${AUTH}/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    })
  } catch {
    // see above
  }
}
