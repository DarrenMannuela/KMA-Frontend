// Reading spreadsheet data as text: CSV files, and rows pasted from Excel or
// Google Sheets (tab-separated), with numbers and dates written the way
// people type them ("Rp 30.000", "2,5", "05/10/2026").

export type Cell = string | number
export type Grid = Cell[][]

/** Parses CSV or tab-separated text. Quoted cells may hold the separator,
 *  newlines and doubled quotes. The separator is guessed from the first line
 *  when not given (Indonesian Excel writes ";"). */
export function parseDelimited(text: string, sep?: string): Grid {
  text = text.replace(/^﻿/, '')
  if (!sep) {
    const first = text.split(/\r?\n/, 1)[0] ?? ''
    const count = (c: string) => first.split(c).length - 1
    sep = ['\t', ';', ','].reduce((best, c) => (count(c) > count(best) ? c : best), ',')
  }
  const rows: Grid = []
  let row: Cell[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === sep) {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map(r => r.map(c => (typeof c === 'string' ? c.trim() : c))).filter(r => r.some(c => c !== ''))
}

/** A number as people write it: "Rp 30.000", "30,000", "2,5", "1.250,75".
 *  Returns null for anything that isn't one. */
export function parseNumber(value: Cell | undefined | null): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = value.replace(/rp\.?/i, '').replace(/[\s ]/g, '')
  if (!s) return null
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[()\-+]/g, '')
  if (!/^[\d.,]+$/.test(s)) return null
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  if (dots && commas) {
    // The later one is the decimal point: 1.250,75 or 1,250.75.
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    s = s.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.')
  } else if (dots + commas > 1) {
    s = s.replace(/[.,]/g, '') // 1.250.000: thousands only
  } else if (dots + commas === 1) {
    // One separator: thousands when exactly three digits follow (30.000),
    // otherwise a decimal point (2,5).
    const [, after] = s.split(/[.,]/)
    s = after.length === 3 ? s.replace(/[.,]/, '') : s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? (negative ? -n : n) : null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8,
  sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A date as an ISO "2026-10-05": from ISO text, day-first text (05/10/2026,
 *  5-10-26, 5 Okt 2026, 05/OCT/26) or an Excel date serial number. */
export function parseDate(value: Cell | undefined | null): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null // not a plausible Excel serial (1954-2119)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = value.trim()
  let y: number, m: number, d: number
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = s.match(/^(\d{1,2})[/.\- ]([a-z]{3})[a-z]*[/.\- ](\d{2,4})$/i))) {
    m = MONTHS[match[2].toLowerCase()]
    ;[d, y] = [Number(match[1]), Number(match[3])]
  } else if ((match = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    const serial = parseNumber(s)
    return serial != null && !/[/.\-]/.test(s) ? parseDate(serial) : null
  }
  if (y < 100) y += 2000
  if (!m || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null // 31/02
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Text for a cell, for name-like fields. */
export const cellText = (value: Cell | undefined | null) => (value == null ? '' : String(value).trim())
