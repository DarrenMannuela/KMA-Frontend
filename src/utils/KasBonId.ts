// Kas Bon IDs are "NN/KB/YY" (e.g. "01/KB/26"), numbered per year across both
// production and operation Kas Bons.
export function suggestNextKasBonId(headers: { id: string }[], year = new Date().getFullYear()): string {
  const yy = String(year).slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KB\\/${yy}$`)
  const used = headers.map(h => h.id.match(pattern)).filter((m): m is RegExpMatchArray => !!m).map(m => parseInt(m[1], 10))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `${String(next).padStart(2, '0')}/KB/${yy}`
}
