// ─── Matches the auth service's public user (from /me and /login) ───────────
export interface AuthUser {
  id: number
  email: string
  name: string
  role: string
  // True when the account still has an admin-set password the user
  // hasn't replaced yet. Frontend routing (see MustChangePasswordRoute)
  // uses this to force a change-password step before the app shell.
  must_change_password: boolean
  // Whether this account has a TOTP second factor set up — drives the
  // TwoFactorPage's "enabled/not enabled" state.
  totp_enabled: boolean
}
