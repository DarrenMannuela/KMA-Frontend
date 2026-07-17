/**
 * Converts an integer Rupiah amount into Indonesian words, e.g.
 * 21600000 -> "dua puluh satu juta enam ratus ribu". Used for the
 * "terbilang" line on the kwitansi/receipt, which is standard on
 * Indonesian receipts as a fraud-resistance measure (the numeral and the
 * words must match).
 */

const ONES = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
  'sepuluh', 'sebelas',
]

function chunkToWords(n: number): string {
  if (n < 12) return ONES[n]
  if (n < 20) return `${chunkToWords(n - 10)} belas`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const rest = n % 10
    return rest === 0 ? `${chunkToWords(tens)} puluh` : `${chunkToWords(tens)} puluh ${chunkToWords(rest)}`
  }
  if (n < 200) return `seratus${n % 100 === 0 ? '' : ` ${chunkToWords(n % 100)}`}`
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    return rest === 0 ? `${chunkToWords(hundreds)} ratus` : `${chunkToWords(hundreds)} ratus ${chunkToWords(rest)}`
  }
  if (n < 2000) return `seribu${n % 1000 === 0 ? '' : ` ${chunkToWords(n % 1000)}`}`
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    return rest === 0 ? `${chunkToWords(thousands)} ribu` : `${chunkToWords(thousands)} ribu ${chunkToWords(rest)}`
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000)
    const rest = n % 1_000_000
    return rest === 0 ? `${chunkToWords(millions)} juta` : `${chunkToWords(millions)} juta ${chunkToWords(rest)}`
  }
  const billions = Math.floor(n / 1_000_000_000)
  const rest = n % 1_000_000_000
  return rest === 0 ? `${chunkToWords(billions)} miliar` : `${chunkToWords(billions)} miliar ${chunkToWords(rest)}`
}

/** e.g. numberToWordsID(21600000) -> "Dua Puluh Satu Juta Enam Ratus Ribu Rupiah" */
export function numberToWordsID(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'Nol Rupiah'
  const words = chunkToWords(n).replace(/\s+/g, ' ').trim()
  const titled = words.replace(/\b\w/g, c => c.toUpperCase())
  return `${titled} Rupiah`
}