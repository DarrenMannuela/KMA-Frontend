import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, UserX, UserCheck, Circle, Loader2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi, UsersApiError } from '@/api/usersApi'
import type { AdminUser } from '@/api/usersApi'
import { ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useIsMobile } from '@/hooks/useIsMobile'

export function UsersPage() {
  const isMobile = useIsMobile()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  // Distinct from "loaded fine, there just aren't any users" — see
  // CrudPage's own isError/EmptyState split for why folding a failed
  // fetch into the same empty-list UI is misleading (this page predates
  // CrudPage and has its own bespoke fetch/render, so it needs its own
  // copy of that fix rather than getting it for free).
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Which row has a deactivate/reactivate request in flight — disables
  // just that row's button so a fast double-click can't fire the mutation
  // twice, without blocking the rest of the table.
  const [pendingId, setPendingId] = useState<number | string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null)

  async function loadUsers() {
    setLoading(true)
    setLoadError(false)
    try {
      const { users } = await usersApi.list()
      setUsers(users)
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not load users')
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function handleDeactivate(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.deactivate(u.id)
      toast.success(`${u.name} deactivated`)
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: false } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not deactivate user')
    } finally {
      setPendingId(null)
    }
  }

  async function handleReactivate(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.reactivate(u.id)
      toast.success(`${u.name} reactivated`)
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: true } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not reactivate user')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy-900">Users</h1>
          <p className="text-sm text-slate-400">Staff accounts are provisioned here — there's no self-signup.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-sm"
        >
          <Plus className="w-4 h-4" />
          Add user
        </button>
      </div>

      {/* Always a popup rather than mobile-only — this is a short, rarely-
          used admin form, unlike the item-heavy Add flows elsewhere in
          the app that keep an inline desktop panel because they're
          reached constantly while looking at the data they're adding to.
          One consistent behavior is simpler here and matches every plain
          CrudPage-based Add form already in the app. */}
      {showForm && (
        <Modal title="Add User" onClose={() => setShowForm(false)}>
          <AddUserForm
            onCreated={(u) => {
              setUsers(prev => [...prev, u])
              setShowForm(false)
            }}
          />
        </Modal>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <AlertTriangle className="w-8 h-8 mb-3 text-red-300" />
            <p className="font-medium text-slate-500 text-sm">Couldn't load users</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Check your connection and try again.</p>
            <button onClick={loadUsers} className="btn-secondary btn-sm">Retry</button>
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No users yet.</p>
        ) : isMobile ? (
          // The plain 5-column table's outer card uses overflow-hidden for
          // its rounded corners (same as every other card in this app) —
          // without a scroll container of its own, a too-wide row just got
          // silently clipped instead of scrollable, cutting off the
          // Deactivate/Reactivate button with no visible sign anything was
          // missing. A card per user sidesteps that instead of adding yet
          // another overflow-x-auto-on-the-table-only wrapper, since a
          // single admin looking up one account at a time reads better as
          // a card than a cramped scrollable row anyway.
          <div className="divide-y divide-slate-50">
            {users.map(u => (
              <div key={u.id} className="p-4">
                <div className="font-medium text-navy-900">{u.name}</div>
                <div className="text-sm text-slate-500 break-all">{u.email}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-gold-50 text-gold-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {u.role}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700' : 'text-slate-400'}`}>
                    <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300'}`} />
                    {u.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                {u.active ? (
                  <button
                    onClick={() => setConfirmDeactivate(u)}
                    disabled={pendingId === u.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 mt-3"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivate(u)}
                    disabled={pendingId === u.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-50 mt-3"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Reactivate
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">{u.name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-gold-50 text-gold-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700' : 'text-slate-400'}`}>
                      <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300'}`} />
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.active ? (
                      <button
                        onClick={() => setConfirmDeactivate(u)}
                        disabled={pendingId === u.id}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 ml-auto disabled:opacity-50"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(u)}
                        disabled={pendingId === u.id}
                        className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 ml-auto disabled:opacity-50"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDeactivate && (
        <ConfirmDialog
          message={`Deactivate ${confirmDeactivate.name}? They'll be signed out everywhere immediately.`}
          confirmLabel="Deactivate"
          onConfirm={() => { handleDeactivate(confirmDeactivate); setConfirmDeactivate(null) }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}
    </div>
  )
}

function AddUserForm({ onCreated }: { onCreated: (u: AdminUser) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { user } = await usersApi.create({ email, name, role })
      toast.success(`Invite sent to ${user.email}`)
      onCreated(user)
      setEmail('')
      setName('')
      setRole('staff')
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : 'Could not create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Name</label>
        <input
          required value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300"
          placeholder="Full name"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Email</label>
        <input
          required type="email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300"
          placeholder="name@company.com"
        />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Role</label>
        <select
          value={role} onChange={e => setRole(e.target.value as 'admin' | 'staff')}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* No password field anymore — the backend generates a locked,
          never-shown password and emails the new hire a one-time
          "set your password" link instead (see CreateUser/AcceptInvite
          on the auth service). Nothing usable to type in here on
          purpose, so there's nothing left for an admin to accidentally
          mishandle by copy-pasting it somewhere insecure. */}
      <p className="col-span-1 sm:col-span-2 text-xs text-slate-400 -mt-2">
        They'll get an email with a link to set their own password. The link expires after a couple of days.
      </p>

      {error && <p className="col-span-1 sm:col-span-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary col-span-1 sm:col-span-2 justify-center text-sm"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? 'Sending invite…' : 'Add user'}
      </button>
    </form>
  )
}