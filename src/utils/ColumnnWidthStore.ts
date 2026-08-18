// Persists the item table's column widths (NO / SIZE / QTY / HARGA NET /
// JUMLAH — KETERANGAN is deliberately left out, see the comment on
// ColumnKey below) to localStorage, keyed once globally rather than per
// invoice — same intent as RekeningStore for the bank details on the
// Kwitansi: a change made while looking at one invoice should carry over
// to the next one printed, not reset back to the defaults.
//
// Implemented as a tiny module-level store with a plain subscribe/notify
// list rather than pulling in a state-management library: every consumer
// (there's realistically only ever one — the invoice item table) shares
// the same in-memory `widths` object and localStorage entry, and
// useColumnWidths just re-renders whichever components are subscribed
// when it changes.
import { useSyncExternalStore } from 'react'


export type ColumnKey = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

// KETERANGAN (the item name column) intentionally has no entry here: it's
// the one flexible column that absorbs whatever width the others don't
// use, so the table keeps filling the full page width no matter how the
// other five are resized. Giving it its own stored pixel width too would
// mean the columns could stop summing to the page width at all, leaving
// either dead space or an overflow on the right edge.
// Sized so every header label fits on one line at the invoice's 14px bold
// header font — hargaNet and jumlah both used to wrap onto two lines
// ("HARGA" / "NET", "JUMLAH" / "(Rp)") at their old, tighter widths (90
// and 100). Widened just enough to fit "HARGA NET" and "JUMLAH (Rp)" on
// one line with a little breathing room, rather than exactly to the pixel
// — a hairline-exact fit reflows to two lines again the moment a
// different browser's font metrics round half a pixel differently.
// qty is wider than a bare "QTY" header needs on its own — this is also
// where the Pelunasan row's typable "LUNAS" input sits (14px bold, same as
// the rest of the table — see InvoicePrintPage's dpPaidLabel input), and
// an <input>'s text clips silently against its own box no matter what CSS
// the surrounding <td> has (unlike a plain <td>, which the rest of this
// file now lets overflow visibly instead of hiding — see the item table's
// own comment), so this default has to actually fit "LUNAS" outright
// rather than just look close. 78 was checked against real canvas-measured
// widths for "LUNAS" at that font before picking it, with a few px of
// headroom rather than shaving it exact.
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  no: 40,
  size: 60,
  qty: 78,
  hargaNet: 105,
  jumlah: 120,
}

const STORAGE_KEY = 'kma-invoice-item-column-widths'
const MIN_WIDTH = 28

function loadWidths(): Record<ColumnKey, number> {
  if (typeof localStorage === 'undefined') return DEFAULT_COLUMN_WIDTHS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_COLUMN_WIDTHS
    const parsed = JSON.parse(raw)
    // Merge over the defaults rather than trusting the stored value
    // outright — protects against a column key that no longer exists (if
    // the columns themselves ever change) leaving a hole in the object.
    return { ...DEFAULT_COLUMN_WIDTHS, ...parsed }
  } catch {
    return DEFAULT_COLUMN_WIDTHS
  }
}

let widths = loadWidths()
const listeners = new Set<() => void>()

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // Storage can fail (private browsing, quota) — resizing still works
    // for the rest of this session via the in-memory `widths` above, it
    // just won't survive a reload. Not worth surfacing to the user over.
  }
}

function setColumnWidth(key: ColumnKey, next: number) {
  const clamped = Math.round(Math.max(MIN_WIDTH, next))
  if (widths[key] === clamped) return
  widths = { ...widths, [key]: clamped }
  persist()
  listeners.forEach(l => l())
}

// Batched sibling of setColumnWidth — for "auto-fit every column at once"
// (see InvoicePrintPage's autoFitAll), which otherwise means five separate
// setColumnWidth calls, each doing its own persist() + listener notify.
// Harmless functionally, but it's five localStorage writes and five
// re-renders for what the user experiences as one action. One merged
// object, one persist, one notify.
function setColumnWidths(next: Partial<Record<ColumnKey, number>>) {
  let changed = false
  const merged = { ...widths }
  for (const key of Object.keys(next) as ColumnKey[]) {
    const clamped = Math.round(Math.max(MIN_WIDTH, next[key]!))
    if (merged[key] !== clamped) {
      merged[key] = clamped
      changed = true
    }
  }
  if (!changed) return
  widths = merged
  persist()
  listeners.forEach(l => l())
}

function resetColumnWidths() {
  widths = { ...DEFAULT_COLUMN_WIDTHS }
  persist()
  listeners.forEach(l => l())
}

export function subscribeColumnWidths(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getColumnWidths() {
  return widths
}

export { setColumnWidth, setColumnWidths, resetColumnWidths, MIN_WIDTH }

// useSyncExternalStore (not useState+useEffect) specifically: this store
// can still be written to from outside a normal React event handler —
// auto-fit measures the table's rendered content via a canvas and pushes
// a computed width in, rather than reacting to a user's own onChange —
// and useSyncExternalStore is the hook actually designed for subscribing
// to that kind of external mutable source without tearing.
export function useColumnWidths() {
  return useSyncExternalStore(subscribeColumnWidths, getColumnWidths, getColumnWidths)
}