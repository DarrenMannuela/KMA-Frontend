import { ApiError } from '@/api'

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
    if (!e.status) return "Can't reach the server — check your internet connection and try again."
    if (e.status === 401) return 'Your session has expired — please sign in again.'
    if (e.status >= 500) return "Something went wrong on our end — please try again in a moment, and let us know if it keeps happening."
    return e.message || 'Something went wrong. Please try again.'
  }
  if (e instanceof Error) {
    if (/network|fetch/i.test(e.message)) return "Can't reach the server — check your internet connection and try again."
    return e.message || 'Something went wrong. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}
