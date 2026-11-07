import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, UserX, UserCheck, Circle, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { usersApi, UsersApiError } from '@/api/usersApi'
import type { AdminUser } from '@/api/usersApi'
import { ConfirmDialog } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/Page'
import { useIsMobile } from '@/hooks/useIsMobile'

export function UsersPage() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()
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
      toast.error(err instanceof UsersApiError ? err.message : t('usersAdmin.couldNotLoad'))
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  // Load once on mount; loadUsers only reads t() for its error toast.
  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDeactivate(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.deactivate(u.id)
      toast.success(t('usersAdmin.deactivatedToast', { name: u.name }))
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: false } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : t('usersAdmin.couldNotDeactivate'))
    } finally {
      setPendingId(null)
    }
  }

  async function handleReactivate(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.reactivate(u.id)
      toast.success(t('usersAdmin.reactivatedToast', { name: u.name }))
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, active: true } : x)))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : t('usersAdmin.couldNotReactivate'))
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(u: AdminUser) {
    setPendingId(u.id)
    try {
      await usersApi.delete(u.id)
      toast.success(t('usersAdmin.deletedToast', { name: u.name }))
      setUsers(prev => prev.filter(x => x.id !== u.id))
    } catch (err) {
      toast.error(err instanceof UsersApiError ? err.message : t('usersAdmin.couldNotDelete'))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <PageHeader
        icon={ShieldCheck}
        title={t('topbar.titles.users')}
        subtitle={t('usersAdmin.subtitle')}
        actions={
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            {t('usersAdmin.addUser')}
          </button>
        }
      />

      {/* Always a popup: a short, rarely used form. */}
      {showForm && (
        <Modal title={t('usersAdmin.addUserTitle')} onClose={() => setShowForm(false)}>
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
          <LoadingState label={t('usersAdmin.loading')} />
        ) : loadError ? (
          <ErrorState what={t('usersAdmin.errorWhat')} onRetry={loadUsers} />
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12 dark:text-slate-500">{t('usersAdmin.noUsers')}</p>
        ) : isMobile ? (
          // One card per user, so the action buttons are never clipped.
          <div className="divide-y divide-slate-50 dark:divide-navy-800/60">
            {users.map(u => (
              <div key={u.id} className="p-4">
                <div className="font-medium text-navy-900 dark:text-slate-100">{u.name}</div>
                <div className="text-sm text-slate-500 break-all dark:text-slate-400">{u.email}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-gold-50 text-gold-700 dark:bg-gold-500/15 dark:text-gold-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                  }`}>
                    {t(`usersAdmin.roles.${u.role}`, { defaultValue: u.role })}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300 dark:text-navy-700'}`} />
                    {u.active ? t('usersAdmin.active') : t('usersAdmin.deactivated')}
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
                      {t('usersAdmin.deactivate')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(u)}
                      disabled={pendingId === u.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {t('usersAdmin.reactivate')}
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete(u)}
                    disabled={pendingId === u.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-700 dark:text-slate-500 dark:hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-widest text-slate-400 dark:border-navy-800 dark:text-slate-500">
                <th className="px-5 py-3">{t('usersAdmin.name')}</th>
                <th className="px-5 py-3">{t('usersAdmin.email')}</th>
                <th className="px-5 py-3">{t('usersAdmin.role')}</th>
                <th className="px-5 py-3">{t('common.status')}</th>
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
                      u.role === 'admin' ? 'bg-gold-50 text-gold-700 dark:bg-gold-500/15 dark:text-gold-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                    }`}>
                      {t(`usersAdmin.roles.${u.role}`, { defaultValue: u.role })}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-green-700 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      <Circle className={`w-2 h-2 ${u.active ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300 dark:text-navy-700'}`} />
                      {u.active ? t('usersAdmin.active') : t('usersAdmin.deactivated')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 can-hover:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {u.active ? (
                        <button
                          onClick={() => setConfirmDeactivate(u)}
                          disabled={pendingId === u.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          {t('usersAdmin.deactivate')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(u)}
                          disabled={pendingId === u.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          {t('usersAdmin.reactivate')}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(u)}
                        disabled={pendingId === u.id}
                        title={t('usersAdmin.permanentlyDeleteTitle', { name: u.name })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-700 dark:text-slate-500 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('common.delete')}
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
          message={t('usersAdmin.confirmDeactivate', { name: confirmDeactivate.name })}
          confirmLabel={t('usersAdmin.deactivate')}
          onConfirm={() => { handleDeactivate(confirmDeactivate); setConfirmDeactivate(null) }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={t('usersAdmin.confirmDelete', { name: confirmDelete.name })}
          confirmLabel={t('usersAdmin.deletePermanently')}
          onConfirm={() => { handleDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

function AddUserForm({ onCreated }: { onCreated: (u: AdminUser) => void }) {
  const { t } = useTranslation()
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
      toast.success(t('usersAdmin.inviteSent', { email: user.email }))
      onCreated(user)
      setEmail('')
      setName('')
      setRole('staff')
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : t('usersAdmin.couldNotCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">{t('usersAdmin.name')}</label>
        <input
          required value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
          placeholder={t('usersAdmin.fullNamePlaceholder')}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">{t('usersAdmin.email')}</label>
        <input
          required type="email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
          placeholder={t('usersAdmin.emailPlaceholder')}
        />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-slate-500">{t('usersAdmin.role')}</label>
        <select
          value={role} onChange={e => setRole(e.target.value as 'admin' | 'staff')}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-300 dark:border-navy-700 dark:text-slate-100"
        >
          <option value="staff">{t('usersAdmin.roleOptions.staff')}</option>
          <option value="admin">{t('usersAdmin.roleOptions.admin')}</option>
        </select>
      </div>

      {/* No password here: the new user gets an email link to set their own. */}
      <p className="col-span-1 sm:col-span-2 text-xs text-slate-400 -mt-2 dark:text-slate-500">
        {t('usersAdmin.inviteHint')}
      </p>

      {error && <p className="col-span-1 sm:col-span-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary col-span-1 sm:col-span-2 justify-center text-sm"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? t('usersAdmin.sendingInvite') : t('usersAdmin.addUser')}
      </button>
    </form>
  )
}