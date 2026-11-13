/** A change against an earlier period, as text: "45%" normally, but a jump
 *  to three times or more reads as a multiple ("8×") — "703%" looks like an
 *  alarm, and usually just means the earlier period was nearly empty.
 *  `percent` is the absolute percentage change; `up` its direction. */
export function changeLabel(percent: number, up: boolean): string {
  if (!up || percent < 200) return `${percent}%`
  const times = (percent + 100) / 100
  return `${times >= 10 ? Math.round(times) : Math.round(times * 10) / 10}×`
}
