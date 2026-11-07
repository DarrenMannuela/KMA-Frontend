import { ApiError } from '@/api'
import i18n from '@/i18n/config'

/** Turns a caught error into a plain-language message, safe to show in a
 *  toast to someone who isn't a developer. The backend's own validation
 *  messages (e.g. "duplicate order ID", "There's no order X") are usually
 *  already written for people and pass straight through unchanged — this
 *  only steps in for the generic, technical-sounding cases: no connection,
 *  an expired session, or an unhandled server error, where the raw message
 *  (e.g. "Network Error", "Request failed with status code 500") wouldn't
 *  mean anything to them or suggest what to do about it. */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (!e.status) return i18n.t('errors.cantReachServer')
    if (e.status === 401) return i18n.t('errors.sessionExpired')
    if (e.status >= 500) return i18n.t('errors.serverError')
    return e.message || i18n.t('errors.generic')
  }
  if (e instanceof Error) {
    if (/network|fetch/i.test(e.message)) return i18n.t('errors.cantReachServer')
    return e.message || i18n.t('errors.generic')
  }
  return i18n.t('errors.generic')
}
