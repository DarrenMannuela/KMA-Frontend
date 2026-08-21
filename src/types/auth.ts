// ─── Matches auth-service's dto/User.go (publicUser() shape) ────────────────
// The auth service is a separate backend and owns the full User record
// (password hash, lockout fields, etc.) — this is just the public subset it
// actually returns to the frontend via /me and /login.
export interface AuthUser {
  id: number
  email: string
  name: string
  role: string
  // True when the account still has an admin-set password the user
  // hasn't replaced yet. Frontend routing (see MustChangePasswordRoute)
  // uses this to force a change-password step before the app shell.
  must_change_password: boolean
}
