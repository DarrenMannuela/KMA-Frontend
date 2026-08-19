import { authHttp, AuthApiError } from '@/api/authApi'

export interface AdminUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'staff'
  active: boolean
}

// Re-exported so existing imports of UsersApiError elsewhere don't need
// to change — but it's really just AuthApiError. Both APIs are served
// by the same auth service, so they should surface failures the same way.
export { AuthApiError as UsersApiError }

// Paths are relative to authHttp's baseURL ('/auth/api/v1/auth'), so
// these resolve to /auth/api/v1/auth/users, .../users/:id/deactivate,
// etc. — matching main.go's route registration exactly, and picking up
// the correct CSRF cookie (kma_csrf) and error normalization for free
// via authHttp's interceptors.
export const usersApi = {
  list: () =>
    authHttp.get<{ users: AdminUser[] }>('/users').then(r => r.data),

  // No password field — the auth service generates a locked password
  // itself and emails the new user a one-time "set your password" link
  // (see CreateUser/AcceptInvite in the auth service). Nothing for an
  // admin to type or relay out of band anymore.
  create: (payload: { email: string; name: string; role: 'admin' | 'staff' }) =>
    authHttp.post<{ user: AdminUser }>('/users', payload).then(r => r.data),

  deactivate: (id: number) =>
    authHttp.post<{ ok: boolean }>(`/users/${id}/deactivate`).then(r => r.data),

  reactivate: (id: number) =>
    authHttp.post<{ ok: boolean }>(`/users/${id}/reactivate`).then(r => r.data),
}