import { formatRp } from '@/components/ui'
import type { ClientContact } from '@/types'

/** The phone number to message for a client: the contact flagged primary,
 *  or the first contact on file with a number if none is flagged, or null
 *  if there's no usable contact at all. */
export function primaryContactPhone(clientId: number | null, contacts: ClientContact[]): string | null {
  if (clientId == null) return null
  const forClient = contacts.filter(c => c.client_id === clientId && c.phone_number)
  return (forClient.find(c => c.is_primary) ?? forClient[0])?.phone_number ?? null
}

/** Builds a wa.me deep link that opens WhatsApp (app or web) with a given
 *  number and a pre-filled message. Nothing is sent automatically — a person
 *  still reviews the message and hits send, which is the right amount of
 *  friction for anything collections-adjacent. Returns null when the number
 *  doesn't look usable after normalizing, so callers can skip rendering the
 *  button rather than link to a dead chat.
 *
 *  Numbers are normalized to Indonesia's country code: a leading 0 (the
 *  common local format, e.g. "0812...") becomes 62, a leading + is dropped,
 *  and a bare national number with neither gets 62 prepended. */
export function waLink(phoneNumber: string | null | undefined, message: string): string | null {
  if (!phoneNumber) return null
  let digits = phoneNumber.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  else if (!digits.startsWith('62')) digits = '62' + digits
  if (digits.length < 10) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** The standard wording for nudging a client about an overdue invoice —
 *  kept in one place so every "remind on WhatsApp" button in the app sends
 *  the same message, in Bahasa Indonesia regardless of the staff member's
 *  own UI language, since that's the language actually used with clients. */
export function overdueReminderMessage({ clientName, invoiceId, orderId, daysLate, amount }: {
  clientName: string
  invoiceId: string
  orderId: string
  daysLate: number
  amount: number
}): string {
  return `Halo ${clientName}, mengingatkan kembali bahwa invoice ${invoiceId} (pesanan ${orderId}) sebesar ${formatRp(amount)} sudah jatuh tempo ${daysLate} hari. Mohon konfirmasi pembayarannya ya. Terima kasih — Kreasi Makmur Abadi`
}
