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

// Paths are under authHttp's base URL: /auth/api/v1/auth/users and so on.
export const usersApi = {
  list: () =>
    authHttp.get<{ users: AdminUser[] }>('/users').then(r => r.data),

  // No password: the auth service emails the new user a link to set one.
  create: (payload: { email: string; name: string; role: 'admin' | 'staff' }) =>
    authHttp.post<{ user: AdminUser }>('/users', payload).then(r => r.data),

  deactivate: (id: number) =>
    authHttp.post<{ ok: boolean }>(`/users/${id}/deactivate`).then(r => r.data),

  reactivate: (id: number) =>
    authHttp.post<{ ok: boolean }>(`/users/${id}/reactivate`).then(r => r.data),
}