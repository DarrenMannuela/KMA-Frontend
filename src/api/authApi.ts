import axios from 'axios'
import type { AuthUser } from '@/types'

// nginx proxies /auth/ to the auth service, so its cookies are same-origin.
// Thrown for any failed auth request, with the status, so callers can tell a
// rejected request from a network error.
export class AuthApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

// Shared by the other admin API modules (usersApi.ts): one base URL, CSRF
// header and error shape.
export const authHttp = axios.create({
  baseURL: '/auth/api/v1/auth',
  headers: { 'Content-Type': 'application/json' },
  // Send and receive the session and CSRF cookies.
  withCredentials: true,
})

// Mutating requests carry the CSRF header (double-submit cookie).
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

// Any 401 means the session expired or was never valid: reload to /login,
// which also clears cached data from the dead session. Not for the login
// request itself (a wrong password), nor when already on /login.
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
export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)kma_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export const authApi = {
  // takeOver signs the account's other live session out first: the auth
  // service allows one session per account, and refuses (409) otherwise.
  login: (email: string, password: string, takeOver = false) =>
    authHttp.post<{ user: AuthUser }>('/login', { email, password, take_over: takeOver }).then(r => r.data),

  me: () =>
    authHttp.get<{ user: AuthUser }>('/me').then(r => r.data),

  logout: () =>
    authHttp.post<{ ok: true }>('/logout').then(r => r.data),

  logoutAll: () =>
    authHttp.post<{ ok: true }>('/logout-all').then(r => r.data),

  // Redeems an invite token and sets the first password; like login, the
  // response carries the now signed-in user.
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