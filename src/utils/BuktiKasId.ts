// Bukti Kas IDs are "NN/BK/KMA/YY" (e.g. "01/BK/KMA/26") — the user's own
// numbering convention for this document, distinct from Kas Bon's
// "NN/KB/YY" (see KasBonId.ts). Numbered per year, same scheme otherwise.
export function suggestNextBuktiKasId(headers: { id: string }[], year = new Date().getFullYear()): string {
  const yy = String(year).slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/BK\\/KMA\\/${yy}$`)
  const used = headers.map(h => h.id.match(pattern)).filter((m): m is RegExpMatchArray => !!m).map(m => parseInt(m[1], 10))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `${String(next).padStart(2, '0')}/BK/KMA/${yy}`
}
