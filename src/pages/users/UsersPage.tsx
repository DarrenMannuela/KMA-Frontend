import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, UserX, UserCheck, Circle, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi, UsersApiError } from '@/api/usersApi'
import type { AdminUser } from '@/api/usersApi'
import { ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/Page'
import { useIsMobile } from '@/hooks/useIsMobile'

export function UsersPage() {
  const isMobile = useIsMobile()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  // A failed fetch shows an error, not an empty list.
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Which row has a deactivate/reactivate request in flight — disables
  // just that row's button so a fast double-click can't fire the mutation
  // twice, without blocking the rest of the table.
  const [pendingId, setPendingId] = useState<number | string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

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

  async function handleDelete(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.delete(u.id)
      toast.success(`${u.name} deleted`)
      setUsers(prev => prev.filter(x => x.id !== u.id))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not delete user')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <PageHeader
        icon={ShieldCheck}
        title="Users"
        subtitle="Staff accounts are provisioned here — there's no self-signup."
        actions={
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Add user
          </button>
        }
      />

      {/* Always a popup: a short, rarely used form. */}
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

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState label="Loading users…" />
        ) : loadError ? (
          <ErrorState what="users" onRetry={loadUsers} />
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12 dark:text-slate-500">No users yet.</p>
        ) : isMobile ? (
          // One card per user, so the action buttons are never clipped.
          <div className="divide-y divide-slate-50 dark:divide-navy-800/60">
            {users.map(u => (
              <div key={u.id} className="p-4">
                <div className="font-medium text-navy-900 dark:text-slate-100">{u.name}</div>
                <div className="text-sm text-slate-500 break-all dark:text-slate-400">{u.email}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-gold-50 text-gold-700' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                  }`}>
                    {u.role}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300 dark:text-navy-700'}`} />
                    {u.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {u.active ? (
                    <button
                      onClick={() => setConfirmDeactivate(u)}
                      disabled={pendingId === u.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(u)}
                      disabled={pendingId === u.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Reactivate
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(u)}
                    disabled={pendingId === u.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-700 dark:text-slate-500 dark:hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-widest text-slate-400 dark:border-navy-800 dark:text-slate-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="group border-b border-slate-50 last:border-0 hover:bg-slate-50/60 dark:border-navy-800/60 dark:hover:bg-white/5">
                  <td className="px-5 py-3 font-medium text-navy-900 dark:text-slate-100">{u.name}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-gold-50 text-gold-700' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300 dark:text-navy-700'}`} />
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {u.active ? (
                        <button
                          onClick={() => setConfirmDeactivate(u)}
                          disabled={pendingId === u.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(u)}
                          disabled={pendingId === u.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(u)}
                        disabled={pendingId === u.id}
                        title={`Permanently delete ${u.name}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-700 dark:text-slate-500 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
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

      {confirmDelete && (
        <ConfirmDialog
          message={`Permanently delete ${confirmDelete.name}? This removes their account entirely — unlike deactivating, this can't be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={() => { handleDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
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
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">Name</label>
        <input
          required value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
          placeholder="Full name"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">Email</label>
        <input
          required type="email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
          placeholder="name@company.com"
        />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">Role</label>
        <select
          value={role} onChange={e => setRole(e.target.value as 'admin' | 'staff')}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* No password here: the new user gets an email link to set their own. */}
      <p className="col-span-1 sm:col-span-2 text-xs text-slate-400 -mt-2 dark:text-slate-500">
        They'll get an email with a link to set their own password. The link expires after a couple of days.
      </p>

      {error && <p className="col-span-1 sm:col-span-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

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