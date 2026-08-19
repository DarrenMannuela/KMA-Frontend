import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X, UserX, UserCheck, Circle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi, UsersApiError } from '@/api/usersApi'
import type { AdminUser } from '@/api/usersApi'

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function loadUsers() {
    setLoading(true)
    try {
      const { users } = await usersApi.list()
      setUsers(users)
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function handleDeactivate(u: AdminUser) {
    if (!confirm(`Deactivate ${u.name}? They'll be signed out everywhere immediately.`)) return
    try {
      await usersApi.deactivate(u.id)
      toast.success(`${u.name} deactivated`)
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: false } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not deactivate user')
    }
  }

  async function handleReactivate(u: AdminUser) {
    try {
      await usersApi.reactivate(u.id)
      toast.success(`${u.name} reactivated`)
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: true } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : 'Could not reactivate user')
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
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {showForm && (
        <AddUserForm
          onCreated={(u) => {
            setUsers(prev => [...prev, u])
            setShowForm(false)
          }}
        />
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No users yet.</p>
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
                        onClick={() => handleDeactivate(u)}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 ml-auto"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(u)}
                        className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 ml-auto"
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
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 mb-4 grid grid-cols-2 gap-4">
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
      <div className="col-span-2">
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
      <p className="col-span-2 text-xs text-slate-400 -mt-2">
        They'll get an email with a link to set their own password. The link expires after a couple of days.
      </p>

      {error && <p className="col-span-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 transition-colors disabled:opacity-60"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? 'Sending invite…' : 'Add user'}
      </button>
    </form>
  )
}