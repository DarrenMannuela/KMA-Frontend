import type { Supplier } from '@/types'
import { SI_UNITS } from '@/utils/Units'
import { parseDate, parseNumber, cellText, type Cell, type Grid } from '@/utils/tableText'
import type { Kind } from './ledgerModel'

// Works out what each column of pasted or imported rows holds, from its
// heading (English or Indonesian) or, without headings, from the values.

export type Target = 'ignore' | 'header_id' | 'date' | 'description' | 'name' | 'supplier' | 'category' | 'qty' | 'unit' | 'price' | 'total' | 'order'

export const TARGET_LABELS: Record<Kind, Record<Target, string>> = {
  production: {
    ignore: "Don't use", header_id: 'Kas Bon ID', date: 'Date', description: 'Kas Bon description', name: 'Bahan',
    supplier: 'Supplier', category: "Don't use", qty: 'Qty', unit: 'Unit', price: 'Price (each)', total: 'Total', order: 'Order',
  },
  operation: {
    ignore: "Don't use", header_id: 'Kas Bon ID', date: 'Date', description: 'Kas Bon description', name: 'Item',
    supplier: "Don't use", category: 'Category', qty: "Don't use", unit: "Don't use", price: 'Price', total: 'Total', order: 'Order',
  },
}

export const TARGETS: Record<Kind, Target[]> = {
  production: ['ignore', 'header_id', 'date', 'description', 'name', 'supplier', 'qty', 'unit', 'price', 'total', 'order'],
  operation: ['ignore', 'header_id', 'date', 'description', 'category', 'name', 'price', 'total', 'order'],
}

// Checked in this order: "jumlah harga" is a total before "jumlah" is a qty.
const HEADINGS: [Target, RegExp][] = [
  ['header_id', /kas ?bon|^no\.? ?(kb|bon)|^id$|nomor/i],
  ['date', /tanggal|^tgl|date/i],
  ['total', /total|sub ?total|nominal|jumlah harga/i],
  ['price', /harga|price|^@|rate|biaya/i],
  ['qty', /qty|jumlah|^jml|banyak|quantity|kuantitas|^pcs$/i],
  ['unit', /satuan|^unit|uom/i],
  ['supplier', /supplier|pemasok|toko|vendor/i],
  ['category', /kategori|category|jenis|^pos$/i],
  ['order', /order|^po\b|pesanan/i],
  ['name', /bahan|material|barang|^item|nama/i],
  ['description', /keterangan|^ket\b|desc|uraian|deskripsi/i],
]

const KAS_BON = /^\d+\s*\/\s*KB\s*\/\s*\d+$/i

export function supplierMatcher(suppliers: Supplier[]) {
  const norm = (s: string) => s.toLowerCase().replace(/·.*$/, '').replace(/[^a-z0-9]/g, '')
  const byName = new Map<string, number>()
  for (const s of suppliers) if (!byName.has(norm(s.supplier_name))) byName.set(norm(s.supplier_name), s.id)
  return (text: string) => byName.get(norm(text)) ?? 0
}

const share = (values: Cell[], test: (v: Cell) => boolean) => {
  const filled = values.filter(v => cellText(v) !== '')
  return filled.length ? filled.filter(test).length / filled.length : 0
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

export interface Guess {
  hasHeadings: boolean
  targets: Target[]
}

export function guessColumns(grid: Grid, kind: Kind, suppliers: Supplier[]): Guess {
  const width = Math.max(0, ...grid.map(r => r.length))
  const first = grid[0] ?? []
  const allowed = new Set(TARGETS[kind])
  const fromHeading = (h: Cell): Target => {
    const text = cellText(h)
    if (!text || parseNumber(text) != null) return 'ignore'
    for (const [t, re] of HEADINGS) {
      if (!re.test(text)) continue
      if (allowed.has(t)) return t
      if (t === 'description' && kind === 'operation') return 'name' // "Keterangan" is the cost itself
    }
    return 'ignore'
  }
  const headingTargets = Array.from({ length: width }, (_, i) => fromHeading(first[i]))
  const hasHeadings = grid.length > 1 && headingTargets.filter(t => t !== 'ignore').length >= Math.min(2, width)
  if (hasHeadings) return { hasHeadings, targets: dedupe(headingTargets) }

  // No headings: read the values.
  const isSupplier = supplierMatcher(suppliers)
  const units = new Set(SI_UNITS.map(u => u.toLowerCase()))
  const targets: Target[] = Array(width).fill('ignore')
  const numeric: number[] = []
  const text: number[] = []
  for (let i = 0; i < width; i++) {
    const col = grid.map(r => r[i] ?? '')
    if (share(col, v => KAS_BON.test(cellText(v))) >= 0.6) targets[i] = 'header_id'
    else if (share(col, v => typeof v === 'string' && /[/.\- ]/.test(v) && parseDate(v) != null) >= 0.6) targets[i] = 'date'
    else if (kind === 'production' && share(col, v => units.has(cellText(v).toLowerCase())) >= 0.6) targets[i] = 'unit'
    else if (kind === 'production' && share(col, v => isSupplier(cellText(v)) > 0) >= 0.5) targets[i] = 'supplier'
    else if (share(col, v => parseNumber(v) != null) >= 0.8) numeric.push(i)
    else if (share(col, v => cellText(v) !== '') > 0) text.push(i)
  }
  const med = (i: number) => median(grid.map(r => parseNumber(r[i]) ?? 0))
  if (kind === 'production') {
    const bySize = [...numeric].sort((a, b) => med(a) - med(b))
    if (bySize.length === 1) targets[bySize[0]] = 'price'
    if (bySize.length >= 2) { targets[bySize[0]] = 'qty'; targets[bySize[1]] = 'price' }
    if (bySize.length >= 3) targets[bySize[2]] = 'total'
    if (text[0] != null) targets[text[0]] = 'name'
    if (text[1] != null) targets[text[1]] = 'description'
  } else {
    const bySize = [...numeric].sort((a, b) => med(a) - med(b))
    if (bySize.length) targets[bySize[bySize.length - 1]] = 'price'
    // A column whose values repeat a lot is a category; the other is the item.
    const distinct = (i: number) => new Set(grid.map(r => cellText(r[i]).toLowerCase())).size / grid.length
    const [a, b] = text
    if (a != null && b != null) {
      const [cat, item] = distinct(a) <= distinct(b) ? [a, b] : [b, a]
      targets[cat] = 'category'
      targets[item] = 'name'
    } else if (a != null) {
      targets[a] = 'category'
    }
  }
  return { hasHeadings: false, targets }
}

/** Only the first column of each kind is used. */
function dedupe(targets: Target[]): Target[] {
  const seen = new Set<Target>()
  return targets.map(t => {
    if (t === 'ignore' || !seen.has(t)) { seen.add(t); return t }
    return 'ignore'
  })
}

/** One imported row, read through the column mapping. */
export interface ImportedRow {
  header_id: string
  date: string | null
  description: string
  name: string
  supplierText: string
  supplier_id: number
  category: string
  qty: number | null
  unit: string
  price: number | null
  order: string
}

export function readRows(grid: Grid, guess: Guess, suppliers: Supplier[]): ImportedRow[] {
  const isSupplier = supplierMatcher(suppliers)
  const units = new Map(SI_UNITS.map(u => [u.toLowerCase(), u]))
  const col = (t: Target) => guess.targets.indexOf(t)
  const at = (r: Cell[], t: Target) => (col(t) >= 0 ? r[col(t)] : undefined)
  return grid.slice(guess.hasHeadings ? 1 : 0).map(r => {
    const qty = col('qty') >= 0 ? parseNumber(at(r, 'qty')) : 1
    let price = parseNumber(at(r, 'price'))
    const total = parseNumber(at(r, 'total'))
    if (price == null && total != null) price = qty ? total / qty : total
    const supplierText = cellText(at(r, 'supplier'))
    const unitText = cellText(at(r, 'unit')).toLowerCase()
    return {
      header_id: cellText(at(r, 'header_id')).toUpperCase().replace(/\s+/g, ''),
      date: parseDate(at(r, 'date')),
      description: cellText(at(r, 'description')).toUpperCase(),
      name: cellText(at(r, 'name')).toUpperCase(),
      supplierText,
      supplier_id: supplierText ? isSupplier(supplierText) : 0,
      category: cellText(at(r, 'category')).toUpperCase(),
      qty,
      unit: units.get(unitText) ?? (unitText || 'pcs'),
      price: price == null ? null : Math.round(price),
      order: cellText(at(r, 'order')).toUpperCase(),
    }
  }).filter(r => r.name || r.category || r.price != null)
}
