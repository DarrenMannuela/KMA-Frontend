import type { ClientItem, ClientItemPrice } from '@/types'
import { cellText, parseNumber, type Grid } from '@/utils/tableText'
import type { SheetSpec } from '@/utils/xlsx'

// The catalogue as the pages see it: items grouped by name with their sizes
// in order, prices looked up by year, and the Excel layout it's exported and
// imported in.

// Sizes that mean "one size for everyone", the same as no size.
const ONE_SIZE = /^(ALL|ALL ?SIZES?|FREE ?SIZE|ONE ?SIZE|-)$/

/** Matches catalogue items and order lines: "kemeja pdh"/null == "KEMEJA PDH"/"",
 *  and a size of "ALL" or "ALL SIZE" counts as no size. */
export function itemKey(name: string, size: string | null | undefined) {
  const s = (size ?? '').trim().toUpperCase()
  return `${name.trim().toUpperCase()}|${ONE_SIZE.test(s) ? '' : s}`
}

export const itemLabel = (i: { item_name: string; size: string | null }) =>
  i.size ? `${i.item_name} (${i.size})` : i.item_name

export const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL']

const LETTER_SIZES: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, '2XL': 6, XXXL: 7, '3XL': 7, '4XL': 8, '5XL': 9, '6XL': 10,
}

/** Sorts sizes the way they're worn (S, M, L, XL...), then numbers, then the rest. */
export function compareSizes(a: string | null, b: string | null): number {
  const rank = (s: string | null) => {
    const v = (s ?? '').trim().toUpperCase()
    if (v === '') return -1
    if (v in LETTER_SIZES) return LETTER_SIZES[v]
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? 100 + n : 10000
  }
  return rank(a) - rank(b) || (a ?? '').localeCompare(b ?? '')
}

export interface ItemGroup {
  name: string
  items: ClientItem[]
}

/** One group per item name, sizes in order. */
export function groupCatalogue(items: ClientItem[]): ItemGroup[] {
  const groups = new Map<string, ClientItem[]>()
  for (const it of items) {
    const list = groups.get(it.item_name) ?? []
    list.push(it)
    groups.set(it.item_name, list)
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({ name, items: list.sort((a, b) => compareSizes(a.size, b.size)) }))
}

export const priceIn = (prices: ClientItemPrice[] | undefined, year: number) =>
  prices?.find(p => p.year === year)

/** The latest price from before a year: what a rise for that year starts from. */
export const priceBefore = (prices: ClientItemPrice[] | undefined, year: number) =>
  (prices ?? []).filter(p => p.year < year).sort((a, b) => b.year - a.year)[0]

export const pctChange = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : null)

export const ROUNDINGS = [0, 100, 500, 1000, 5000]

export type Change = { mode: 'pct' | 'rp'; amount: number; roundTo: number }

/** A price after a rise (or a cut): by a percentage or a rupiah amount, then
 *  rounded up to a tidy number. */
export function adjustPrice(price: number, c: Change): number {
  const raw = c.mode === 'pct' ? price * (1 + c.amount / 100) : price + c.amount
  const rounded = c.roundTo > 0 ? Math.ceil(Math.round(raw) / c.roundTo) * c.roundTo : Math.round(raw)
  return Math.max(0, rounded)
}

/** January 1st of a year as an ISO date, the default "from" date of a year's price. */
export const yearStart = (year: number) => new Date(Date.UTC(year, 0, 1)).toISOString()

/** Every year with a price for any of these items, newest first. */
export function priceYears(pricesByItem: Record<number, ClientItemPrice[]>, items: ClientItem[]): number[] {
  const years = new Set<number>()
  for (const it of items) for (const p of pricesByItem[it.id] ?? []) years.add(p.year)
  return [...years].sort((a, b) => b - a)
}

// ── Excel ────────────────────────────────────────────────────────────────────

/** Item, Size, Notes, then a price column per year: the layout export writes
 *  and import reads, so an exported file can be edited and brought back. */
export function catalogueSheet(items: ClientItem[], pricesByItem: Record<number, ClientItemPrice[]>): SheetSpec {
  const years = priceYears(pricesByItem, items).reverse()
  return {
    name: 'Catalogue',
    columns: [
      { header: 'Item', width: 34 }, { header: 'Size', width: 8 }, { header: 'Notes', width: 30 },
      ...years.map(y => ({ header: String(y), kind: 'money' as const, width: 14 })),
    ],
    rows: groupCatalogue(items).flatMap(g => g.items.map(it => [
      it.item_name, it.size ?? '', it.notes ?? '', ...years.map(y => priceIn(pricesByItem[it.id], y)?.price ?? null),
    ])),
  }
}

export interface ImportRow {
  name: string
  size: string
  notes: string | null
  prices: { year: number; price: number }[]
}

const isHeader = (v: string, words: string[]) => words.some(w => v === w || v.startsWith(w + ' '))

/** Reads a catalogue sheet: a header row naming the item column (Item / Nama
 *  / Barang), optionally Size and Notes, and year columns (2025, 2026...)
 *  holding prices. */
export function readCatalogueGrid(grid: Grid): { rows: ImportRow[]; years: number[] } | { error: string } {
  const headerAt = grid.findIndex(r => r.some(c => isHeader(cellText(c).toLowerCase(), ['item', 'nama', 'barang', 'name'])))
  if (headerAt < 0) return { error: 'No header row: the first row should name the columns (Item, Size, Notes, 2025, 2026…)' }
  const header = grid[headerAt].map(c => cellText(c).toLowerCase())
  const nameCol = header.findIndex(h => isHeader(h, ['item', 'nama', 'barang', 'name']))
  const sizeCol = header.findIndex(h => isHeader(h, ['size', 'ukuran']))
  const notesCol = header.findIndex(h => isHeader(h, ['notes', 'note', 'catatan', 'keterangan']))
  const yearCols = header.flatMap((h, i) => (/^(19|20)\d\d$/.test(h) ? [{ i, year: Number(h) }] : []))
  if (!yearCols.length) return { error: 'No price columns: name them by year (2025, 2026…)' }

  const rows: ImportRow[] = []
  for (const r of grid.slice(headerAt + 1)) {
    const name = cellText(r[nameCol]).toUpperCase()
    if (!name) continue
    rows.push({
      name,
      size: sizeCol >= 0 ? cellText(r[sizeCol]).toUpperCase() : '',
      notes: notesCol >= 0 ? cellText(r[notesCol]) || null : null,
      prices: yearCols.flatMap(({ i, year }) => {
        const price = parseNumber(r[i])
        return price != null && price > 0 ? [{ year, price: Math.round(price) }] : []
      }),
    })
  }
  return { rows, years: yearCols.map(c => c.year) }
}
