import axios from 'axios'
import type { AuthUser } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Base URL: nginx proxies /auth/ → the standalone auth-service container
// (see nginx.conf's /auth/ location). Same "just a relative path, let the
// proxy handle it" approach as src/api/index.ts's '/api/v1' — keeps the
// auth API same-origin from the browser's point of view, so no CORS config
// is needed and the session/CSRF cookies behave like ordinary same-origin
// cookies.
//
// For local `vite dev` without nginx in front, add a matching proxy entry
// in vite.config.ts:
//   '/auth': { target: 'http://localhost:8001', changeOrigin: true }
// ─────────────────────────────────────────────────────────────────────────────
// Thrown by the response interceptor below for any failed auth request,
// so callers (e.g. LoginPage) can distinguish "server rejected the
// request" (with a status + message worth showing) from other failures
// like a network error.
export class AuthApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

// Exported so other admin-only API modules (e.g. usersApi.ts) hit the
// same auth service through the same baseURL, CSRF header injection,
// and error normalization — instead of each one reimplementing (and
// risking drifting from) those details separately.
export const authHttp = axios.create({
  baseURL: '/auth/api/v1/auth',
  headers: { 'Content-Type': 'application/json' },
  // Required so the browser sends/receives the session + CSRF cookies —
  // axios does not send cookies cross-origin (or even same-origin in some
  // setups) without this explicitly set, unlike a plain same-origin form
  // submit.
  withCredentials: true,
})

// Mutating requests must carry the CSRF header (double-submit pattern —
// see auth-service/internal/middleware/csrf.go). GETs are exempt since
// they don't touch state, and the cookie won't exist yet before the very
// first login anyway.
authHttp.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (method !== 'get') {
    const csrf = readCsrfCookie()
    if (csrf) {
      config.headers = config.headers ?? {}
      config.headers['X-CSRF-Token'] = csrf
    }
  }
  return config
})

// Fires on any 401 from the auth service — the session either expired
// (hit AUTH_SESSION_ABSOLUTE_TTL_HOURS or went idle past
// AUTH_SESSION_IDLE_TTL_HOURS) or was never valid to begin with. Without
// this, a tab left open past that point just starts silently failing
// every subsequent request — whatever page it's on either shows stale
// data forever or throws an unhandled AuthApiError nobody sees, since
// nothing was previously watching for this. A hard `window.location`
// redirect (not react-router's navigate) is deliberate: this runs inside
// an axios interceptor, outside any component, so there's no router
// context to call navigate from — and a full reload is actually the
// right behavior here anyway, since it clears out any in-memory
// React Query cache / component state left over from the dead session
// instead of leaving it around for a new login to potentially inherit.
//
// Guarded two ways so this can't loop or misfire:
//   - requestUrl containing '/login': a 401 THERE is just "wrong
//     password" on an actual login attempt — an expected, inline-
//     handled failure (see LoginPage), not a session that expired.
//   - already on /login: nothing to redirect away from, and every
//     failed-login attempt would otherwise bounce through this same
//     interceptor and reload the login page out from under whoever's
//     mid-typing their password.
export function handleSessionExpired(requestUrl?: string) {
  if (requestUrl?.includes('/login')) return
  if (window.location.pathname.startsWith('/login')) return
  window.location.href = '/login'
}

authHttp.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) handleSessionExpired(e.config?.url)
    return Promise.reject(new AuthApiError(
      e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? 'Error',
      e.response?.status
    ))
  }
)

// The CSRF cookie is deliberately NOT HttpOnly (see the auth service's
// csrf middleware) — this is the one place the frontend is supposed to
// read a cookie directly, to echo it back as a header.
function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)kma_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export const authApi = {
  login: (email: string, password: string) =>
    authHttp.post<{ user: AuthUser }>('/login', { email, password }).then(r => r.data),

  me: () =>
    authHttp.get<{ user: AuthUser }>('/me').then(r => r.data),

  logout: () =>
    authHttp.post<{ ok: true }>('/logout').then(r => r.data),

  logoutAll: () =>
    authHttp.post<{ ok: true }>('/logout-all').then(r => r.data),

  // Redeems a one-time invite token (from the "…/set-password?token=…"
  // link CreateUser emails) and sets the account's first real password.
  // Unlike changePassword, the backend logs the caller straight into a
  // new session on success (see AcceptInvite's comment in
  // user_handler.go for why) — so this response, like login's, carries
  // a user the caller should apply to auth state immediately.
  acceptInvite: (token: string, newPassword: string) =>
    authHttp.post<{ user: AuthUser }>('/accept-invite', {
      token,
      new_password: newPassword,
    }).then(r => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    authHttp.post<{ ok: true; message: string }>('/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }).then(r => r.data),
}