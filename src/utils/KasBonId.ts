// Kas Bon IDs follow "NN/KB/YY" (e.g. "01/KB/26") — same convention and
// per-year restart as suggestNextOrderId/suggestNextDeliveryId elsewhere.
// Takes the raw FinanceHeader list (not productionHooks'/operationHooks'
// flattened rows) so the suggestion accounts for every Kas Bon in use,
// including ones that only have items from the *other* domain so far —
// see the comment on useFinanceHeaders in hooks/index.ts. Shared between
// ProductionDashboard and OperationsDashboard since both write into the
// same Kas Bon ID sequence.
export function suggestNextKasBonId(headers: { id: string }[]): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const pattern = new RegExp(`^(\\d+)\\/KB\\/${yy}$`)
  const usedNumbers = headers
    .map(h => h.id.match(pattern))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => parseInt(m[1], 10))
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${String(next).padStart(2, '0')}/KB/${yy}`
}