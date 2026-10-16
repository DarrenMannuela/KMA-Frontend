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

// A plain 'login' success, or — for an account with 2FA on — a 202 telling
// the caller to collect a code next (see authApi.mfaLogin). Both are 2xx
// responses, not errors: axios resolves either the same way, so the caller
// tells them apart by checking 'mfa_required'.
export type LoginResult = { user: AuthUser } | { mfa_required: true }

export const authApi = {
  // takeOver signs the account's other live session out first: the auth
  // service allows one session per account, and refuses (409) otherwise.
  login: (email: string, password: string, takeOver = false) =>
    authHttp.post<LoginResult>('/login', { email, password, take_over: takeOver }).then(r => r.data),

  // The second step of logging in to an account with 2FA on — pass
  // exactly one of code (from an authenticator app) or recoveryCode (one
  // of the one-time backup codes). Redeems the pending-login cookie
  // login() above left behind, same as login() would on success.
  mfaLogin: (code?: string, recoveryCode?: string) =>
    authHttp.post<{ user: AuthUser; recovery_code_used?: boolean; recovery_codes_remaining?: number }>('/totp/login', {
      code: code || undefined,
      recovery_code: recoveryCode || undefined,
    }).then(r => r.data),

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

  // ── Two-factor (TOTP) — the authed user's own device ─────────────────
  // Requires the current password (not just the existing session) so a
  // hijacked session alone can't enroll an attacker's device, or strip
  // the real owner's 2FA off — see the auth service's own comment on
  // SetupTOTP/DisableTOTP for the full reasoning.
  setupTotp: (currentPassword: string) =>
    authHttp.post<{ otpauth_url: string }>('/totp/setup', { current_password: currentPassword }).then(r => r.data),

  // Confirms the code from setupTotp's QR actually works, which is what
  // turns 2FA on. recovery_codes is shown exactly once — nothing shows
  // it again afterwards, so the caller has to get the user to save them
  // before moving on.
  verifyTotp: (code: string) =>
    authHttp.post<{ recovery_codes: string[] }>('/totp/verify', { code }).then(r => r.data),

  disableTotp: (currentPassword: string) =>
    authHttp.post<{ ok: true }>('/totp/disable', { current_password: currentPassword }).then(r => r.data),
}