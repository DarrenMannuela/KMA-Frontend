// The invoice print view as an Excel sheet: the same masthead, details,
// item table (with its folds, blank rows and every cell's formatting),
// totals, notes, signatures and address, laid out on columns
// ITEM · KETERANGAN · SIZE · QTY · HARGA NET · JUMLAH. JUMLAH and the
// totals are formulas, so changing a quantity or price in Excel adds up
// again. A4 portrait, fitted to one page wide.

import type { Invoice, Item } from '@/types'
import { resolveFormat, type FormatColumn, type InvoiceLayout } from '@/utils/InvoiceLayoutStore'
import type { PrintLayout } from '@/utils/printLayout'
import { colName } from '@/utils/xlsx'
import { buildStyledXlsx, colPx, pxToCol, type XBorder, type XCell, type XRow, type XStyle } from '@/utils/xlsxStyled'

type FixedColumn = 'no' | 'size' | 'qty' | 'hargaNet' | 'jumlah'

export interface InvoiceExcelInput {
  invoice: Invoice
  header: {
    kepada: string; untuk: string; alamat: string; telp: string; email: string
    tanggal: string; po: string; lamaProduksi: string; mulaiProduksi: string
  }
  groups: { name: string; rows: Item[] }[]
  isFolded: (name: string) => boolean
  extraGapRows: Record<string, number>
  /** The cell formatting saved for this invoice. */
  sheet: InvoiceLayout
  print: PrintLayout
  /** CSS font stacks; the first family is used. */
  fonts: { main: string; serif: string }
  /** The print view's column widths and what's in each, in px. */
  columnWidths: Record<FixedColumn, number>
  columnTexts: Record<FixedColumn, string[]>
  tableWidthPx: number
  ketMinPx: number
  /** An item row's height at full size, px. */
  rowHeightPx: number
  measure: (text: string, cssFont: string) => number
  totalNote: string
  dp: { show: boolean; percent: number; amount: number; paidLabel: string | null }
  balance: number
  jatuhTempo: string
  notes: string[]
  rekening: { accountName: string; bankBranch: string; accountNumber: string }
  signatory: { name: string; title: string }
  logo: { png: Uint8Array; width: number; height: number } | null
}

const COMPANY = 'KREASI  MAKMUR  ABADI'
const ADDRESS = [
  'MUARA KARANG BLOK 9 SELATAN NO. 52 - 55 , JAKARTA UTARA 14450',
  'TELP. 021.300.253.99 / Hp. 0811.857.372',
  'Email : fifi67@yahoo.com',
]
const COPIES = [['Asli', 'Client'], ['Copy 1', 'KMA'], ['Copy 2', 'Produksi KMA']]
const COLS: FormatColumn[] = ['no', 'ket', 'size', 'qty', 'hargaNet', 'jumlah']
const MONEY = '#,##0'
const TITLE_BLUE = '#1f4e79'

// Excel at 100% shows the page a third bigger than print px (1pt = 4/3px):
// so sizes in print px become the same number of points, and widths and
// heights grow by 4/3. Fitting to the page width brings it back for paper.
const S = 4 / 3
const ptOf = (px: number) => Math.round(px * 2) / 2

const FRAME: XBorder = { style: 'medium' }
const LINE: XBorder = { style: 'thin' }
const ROW_LINE: XBorder = { style: 'thin', color: '#c8c8c8' }
const FOOT: XBorder = { style: 'double' }
const firstFamily = (stack: string) => stack.split(',')[0].replace(/['"]/g, '').trim()

export function buildInvoiceXlsx(x: InvoiceExcelInput): Blob {
  const P = x.print
  const MAIN = firstFamily(x.fonts.main)
  const SERIF = firstFamily(x.fonts.serif)
  const gap = (px: number) => Math.round(px * P.spacing)
  const bold = (px: number) => `bold ${px}px ${x.fonts.main}`

  // ── Columns: the print view's widths, never narrower than what's in them
  // at full size, nor than the details' labels that sit in them. ──
  const w = { ...x.columnWidths }
  for (const c of Object.keys(w) as FixedColumn[]) {
    w[c] = Math.max(w[c], ...x.columnTexts[c].map(t => x.measure(t, bold(P.bodySize)) + 14))
  }
  const leftLabels = ['KEPADA YTH', 'UNTUK', 'Telp', 'Email']
  const rightLabels = ['TANGGAL', 'INVOICE No.', 'PO No.', 'LAMA PRODUKSI', 'MULAI PRODUKSI']
  const labelW = (labels: string[]) => Math.max(...labels.map(l => x.measure(l, bold(P.detailsSize)))) + 14
  w.no = Math.max(w.no, labelW(leftLabels))
  const rightNeed = labelW(rightLabels)
  if (w.size + w.qty < rightNeed) w.qty = rightNeed - w.size
  const ket = Math.max(x.ketMinPx, x.tableWidthPx - (w.no + w.size + w.qty + w.hargaNet + w.jumlah))
  const printPx = [w.no, ket, w.size, w.qty, w.hargaNet, w.jumlah]
  const cols = printPx.map(px => pxToCol(px * S))
  const excelTablePx = cols.reduce((n, c) => n + colPx(c), 0)
  // How many lines a text takes in this much print width.
  const lines = (text: string, font: string, widthPx: number) =>
    text.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(x.measure(part, font) / Math.max(20, widthPx - 8))), 0)

  const rows: XRow[] = []
  const merges: string[] = []
  const add = (cells: (XCell | undefined)[], height?: number) => { rows.push({ cells, height }); return rows.length }
  const space = (px: number) => { if (px > 0) add([], ptOf(px)) }
  const merge = (r: number, c0: number, c1: number) => merges.push(`${colName(c0)}${r}:${colName(c1)}${r}`)
  const next = () => rows.length + 1

  // ── Masthead: the logo over the company name, at the layout's side. ──
  const companyFont = bold(P.companySize)
  const nameW = x.measure(COMPANY, companyFont) * S
  const align = P.logoPosition === 'center' ? 'center' : P.logoPosition === 'right' ? 'right' : 'left'
  let image: { png: Uint8Array; x: number; y: number; width: number; height: number } | undefined
  if (P.logoPosition !== 'none' && x.logo) {
    const lw = P.logoSize
    const lh = lw * (x.logo.height / x.logo.width)
    const imgW = lw * S
    const imgX = align === 'center' ? (excelTablePx - imgW) / 2
      : align === 'right' ? excelTablePx - 3 - (nameW + imgW) / 2
      : 3 + Math.max(0, (nameW - imgW) / 2)
    image = { png: x.logo.png, x: Math.max(0, imgX), y: 2, width: imgW, height: lh * S }
    add([], ptOf(lh + gap(8) + 2))
  }
  const companyRow = add([{ v: COMPANY, s: { font: MAIN, size: ptOf(P.companySize), bold: true, h: align, v: 'center' } }], ptOf(P.companySize * 1.4))
  merge(companyRow, 0, 5)
  space(gap(6))
  const titleRow = add([{ v: 'INVOICE', s: { font: SERIF, size: ptOf(P.titleSize), bold: true, color: TITLE_BLUE, h: 'center', v: 'center' } }], ptOf(P.titleSize * 1.3))
  merge(titleRow, 0, 5)
  space(gap(12))

  // ── Details: the client on the left, the invoice on the right. ──
  const h = x.header
  const left: [string, string, boolean?][] = [['KEPADA YTH', h.kepada], ['UNTUK', h.untuk], ['', h.alamat]]
  if (h.telp) left.push(['Telp', h.telp])
  if (h.email) left.push(['Email', h.email, true])
  const right: [string, string][] = [['TANGGAL', h.tanggal], ['INVOICE No.', x.invoice.id], ['PO No.', h.po || '-']]
  if (h.lamaProduksi) right.push(['LAMA PRODUKSI', h.lamaProduksi])
  if (h.mulaiProduksi) right.push(['MULAI PRODUKSI', h.mulaiProduksi])
  const detail: XStyle = { font: MAIN, size: ptOf(P.detailsSize), bold: true, v: 'top' }
  const detailFont = bold(P.detailsSize)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const [ll, lv, isEmail] = left[i] ?? ['', '']
    const [rl, rv] = right[i] ?? ['', '']
    const n = Math.max(lines(lv, detailFont, ket), lines(rv, detailFont, w.hargaNet + w.jumlah))
    const r = add([
      { v: ll, s: detail },
      { v: lv, s: isEmail ? { ...detail, bold: false, underline: true, color: '#1a56db' } : { ...detail, wrap: true } },
      { v: rl, s: detail }, undefined,
      { v: rv, s: { ...detail, wrap: true } },
    ], ptOf(n * P.detailsSize * 1.3 + 3))
    merge(r, 2, 3)
    merge(r, 4, 5)
  }
  space(gap(14))

  // ── The item table. ──
  const sides = (c: number) => ({ left: c === 0 ? FRAME : LINE, right: c === 5 ? FRAME : LINE })
  // The cell's own look, then the formatting set for its column, row and itself.
  const fmt = (rowKey: string, col: FormatColumn, s: XStyle): XStyle => {
    const f = resolveFormat(x.sheet, rowKey, col)
    return {
      ...s,
      ...(f.align ? { h: f.align } : {}),
      ...(f.bold != null ? { bold: f.bold } : {}),
      ...(f.italic ? { italic: true } : {}),
      ...(f.fill ? { fill: f.fill } : {}),
    }
  }
  // A row height set in the Format bar is a minimum, as on the page: a
  // wrapping name still makes its row taller.
  const setHeight = (rowKey: string, fallback: number) => {
    const set = x.sheet.rows[rowKey]?.height
    return set ? Math.max(ptOf(set + 4), fallback) : fallback
  }

  const headStyle = (c: number): XStyle => ({
    font: MAIN, size: ptOf(P.bodySize - 1), bold: true, h: 'center', v: 'center', wrap: true,
    border: { top: FRAME, bottom: { style: 'double', color: '#e26b0a' }, ...sides(c) },
  })
  const heads = ['ITEM', 'KETERANGAN', 'SIZE', 'QTY / SET', 'HARGA NET / PCS', 'JUMLAH (Rp)']
  add(heads.map((v, c) => ({ v, s: fmt('head', COLS[c], headStyle(c)) })), setHeight('head', ptOf((P.bodySize - 1) * 1.15 * 2 + 14)))

  const body = (c: number, s: XStyle = {}): XStyle => ({
    font: MAIN, size: ptOf(P.bodySize), v: 'center',
    // One light line under each row (the heading's rule is above the first).
    border: { bottom: ROW_LINE, ...sides(c) }, ...s,
  })
  const baseRow = ptOf(x.rowHeightPx + 4)
  const bodyFont = bold(P.bodySize)
  const nameHeight = (text: string, widthPx: number) => Math.max(baseRow, ptOf(lines(text, bodyFont, widthPx) * P.bodySize * 1.2 + 4))
  const firstItem = next()
  x.groups.forEach((g, gi) => {
    if (x.isFolded(g.name)) {
      const key = `fold-${g.name}`
      const qty = g.rows.reduce((n, i) => n + i.amount, 0)
      const sum = g.rows.reduce((n, i) => n + i.sub_total, 0)
      const prices = [...new Set(g.rows.map(i => i.price))].sort((a, b) => a - b)
      const sizes = g.rows.map(i => i.size || '-').join(', ')
      add([
        { v: gi + 1, s: fmt(key, 'no', body(0, { h: 'center' })) },
        { v: g.name.toUpperCase(), s: fmt(key, 'ket', body(1, { h: 'center', bold: true, wrap: true })) },
        { v: sizes, s: fmt(key, 'size', body(2, { h: 'center', wrap: true })) },
        { v: qty, s: fmt(key, 'qty', body(3, { h: 'right', numFmt: MONEY })) },
        prices.length === 1
          ? { v: prices[0], s: fmt(key, 'hargaNet', body(4, { h: 'right', numFmt: MONEY })) }
          : { v: `${prices[0].toLocaleString('en-US')} – ${prices[prices.length - 1].toLocaleString('en-US')}`, s: fmt(key, 'hargaNet', body(4, { h: 'right', wrap: true })) },
        { v: sum, s: fmt(key, 'jumlah', body(5, { h: 'right', numFmt: MONEY })) },
      ], setHeight(key, Math.max(nameHeight(g.name, ket), nameHeight(sizes, w.size))))
    } else {
      g.rows.forEach((it, ri) => {
        const key = `item-${it.id}`
        const r = next()
        const formula = it.sub_total === it.amount * it.price
        add([
          { v: ri === 0 ? gi + 1 : '', s: fmt(key, 'no', body(0, { h: 'center' })) },
          { v: ri === 0 ? it.item_name.toUpperCase() : '', s: fmt(key, 'ket', body(1, { h: 'center', bold: true, wrap: true })) },
          { v: it.size ?? '', s: fmt(key, 'size', body(2, { h: 'center' })) },
          { v: it.amount, s: fmt(key, 'qty', body(3, { h: 'right', numFmt: MONEY })) },
          { v: it.price, s: fmt(key, 'hargaNet', body(4, { h: 'right', numFmt: MONEY })) },
          { v: it.sub_total, f: formula ? `D${r}*E${r}` : undefined, s: fmt(key, 'jumlah', body(5, { h: 'right', numFmt: MONEY })) },
        ], setHeight(key, ri === 0 ? nameHeight(it.item_name, ket) : baseRow))
      })
    }
    // The blank row(s) after each item, a dash under JUMLAH.
    for (let k = 0; k < 1 + (x.extraGapRows[g.name] ?? 0); k++) {
      const key = `gap-${g.name}-${k}`
      add(COLS.map((col, c) => ({ v: c === 5 ? '-' : '', s: fmt(key, col, body(c, { h: c === 5 ? 'right' : undefined })) })), setHeight(key, baseRow))
    }
  })
  if (!x.groups.length) add(COLS.map((_, c) => ({ s: body(c) })), baseRow)
  const lastItem = next() - 1

  // ── TOTAL, D/P, PELUNASAN: boxed figures on the right, open on the left. ──
  const sumRow = ptOf(x.rowHeightPx + 8)
  const sum = (c: number, s: XStyle = {}, extra: XStyle['border'] = {}): XStyle => ({
    font: MAIN, size: ptOf(P.bodySize), bold: true, v: 'center',
    border: { top: LINE, bottom: LINE, left: LINE, right: c === 5 ? FRAME : LINE, ...extra }, ...s,
  })
  const open = (c: number, s: XStyle = {}, extra: XStyle['border'] = {}): XStyle => ({
    font: MAIN, size: ptOf(P.bodySize), v: 'center', border: { ...(c === 0 ? { left: FRAME } : {}), ...extra }, ...s,
  })
  const qtyTotal = x.groups.reduce((n, g) => n + g.rows.reduce((m, i) => m + i.amount, 0), 0)
  const itemsTotal = x.groups.reduce((n, g) => n + g.rows.reduce((m, i) => m + i.sub_total, 0), 0)
  const hasItems = lastItem >= firstItem && x.groups.length > 0
  const totalRow = next()
  add([
    { v: x.totalNote, s: fmt('total', 'ket', open(0, { indent: 1 }, { top: LINE })) },
    { s: fmt('total', 'ket', open(1, {}, { top: LINE })) },
    { s: fmt('total', 'ket', open(2, {}, { top: LINE })) },
    { v: qtyTotal, f: hasItems ? `SUM(D${firstItem}:D${lastItem})` : undefined, s: fmt('total', 'qty', sum(3, { h: 'right', numFmt: MONEY })) },
    { v: 'TOTAL', s: fmt('total', 'hargaNet', sum(4, { h: 'center' })) },
    { v: x.invoice.total, f: hasItems && Math.abs(itemsTotal - x.invoice.total) < 1 ? `SUM(F${firstItem}:F${lastItem})` : undefined, s: fmt('total', 'jumlah', sum(5, { h: 'right', numFmt: MONEY })) },
  ], setHeight('total', sumRow))
  merge(totalRow, 0, 2)

  let dpRow = 0
  if (x.dp.show) {
    dpRow = next()
    add([
      { s: fmt('dp', 'ket', open(0)) }, { s: fmt('dp', 'ket', open(1)) }, { s: fmt('dp', 'ket', open(2)) },
      { v: x.dp.paidLabel ?? '', s: fmt('dp', 'qty', sum(3, { h: 'right', bold: false })) },
      { v: `D/P - ${x.dp.percent} %`, s: fmt('dp', 'hargaNet', sum(4, { h: 'center', bold: false })) },
      // A Pelunasan shows the paid D/P in brackets.
      { v: x.dp.amount, s: fmt('dp', 'jumlah', sum(5, { h: 'right', numFmt: x.dp.paidLabel != null ? '(#,##0)' : MONEY })) },
    ], setHeight('dp', sumRow))
    merge(dpRow, 0, 2)
  }

  const discount = x.invoice.discount ?? 0
  const balanceFormula = discount ? undefined : dpRow ? `F${totalRow}-F${dpRow}` : `F${totalRow}`
  const lastRow = next()
  add([
    { v: x.jatuhTempo, s: fmt('pelunasan', 'ket', open(0, { h: 'right', bold: true }, { bottom: FOOT })) },
    { s: fmt('pelunasan', 'ket', open(1, {}, { bottom: FOOT })) },
    { s: fmt('pelunasan', 'ket', open(2, {}, { bottom: FOOT })) },
    { s: fmt('pelunasan', 'ket', open(3, {}, { bottom: FOOT })) },
    { v: 'PELUNASAN', s: fmt('pelunasan', 'hargaNet', sum(4, { h: 'center' }, { bottom: FOOT })) },
    { v: x.balance, f: balanceFormula, s: fmt('pelunasan', 'jumlah', sum(5, { h: 'right', numFmt: MONEY }, { bottom: FOOT })) },
  ], setHeight('pelunasan', sumRow))
  merge(lastRow, 0, 3)

  // ── CATATAN, with the bank details as the last point. ──
  space(gap(12))
  const noteSize = P.footerSize + 1
  const note: XStyle = { font: SERIF, size: ptOf(noteSize), v: 'top', wrap: true }
  const noteFont = `${noteSize}px ${x.fonts.serif}`
  const lineH = noteSize * 1.32
  const noteRow = (text: string, s: XStyle = note) => {
    const r = add([{ v: text, s }], ptOf(lines(text, noteFont, x.tableWidthPx) * lineH + 2))
    merge(r, 0, 5)
  }
  noteRow('CATATAN :')
  const visible = x.notes.filter(n => n.trim())
  visible.forEach((n, i) => noteRow(`${i + 1}.  ${n}`))
  noteRow(`${visible.length + 1}.  Pembayaran via transfer ke rekening a/n :`)
  noteRow(x.rekening.accountName, { ...note, indent: 2 })
  noteRow(x.rekening.bankBranch, { ...note, indent: 2 })
  noteRow(`No. Rek. ${x.rekening.accountNumber}`, { ...note, font: MAIN, bold: true, indent: 2 })

  // ── Signatures: received by (A:B), made by (D:F), each over its own line. ──
  space(gap(14))
  const foot: XStyle = { font: MAIN, size: ptOf(P.footerSize), v: 'bottom' }
  const footSerif: XStyle = { ...foot, font: SERIF }
  const footH = ptOf(P.footerSize * 1.4)
  const signRow = (leftText: string, rightText: string, s: XStyle = footSerif, height = footH) => {
    const r = add([{ v: leftText, s }, { s }, undefined, { v: rightText, s }, { s }, { s }], height)
    merge(r, 0, 1); merge(r, 3, 5)
    return r
  }
  signRow('ASLI INVOICE DI TERIMA OLEH :', 'DI BUAT OLEH :', { ...foot, bold: true })
  space(gap(96))
  signRow('TANDA TANGAN', '', { ...footSerif, border: { bottom: LINE } })
  signRow('NAMA JELAS', x.signatory.name)
  signRow('JABATAN', x.signatory.title)
  let r: number

  // Who keeps which copy.
  space(gap(10))
  for (const [who, copy] of COPIES) add([{ v: who, s: footSerif }, { v: `:      ${copy}`, s: footSerif }], footH)

  // The company's address.
  space(gap(14))
  for (const line of ADDRESS) {
    r = add([{ v: line, s: { font: MAIN, size: ptOf(P.footerSize - 0.5), bold: true, h: 'center' } }], ptOf((P.footerSize - 0.5) * 1.4))
    merge(r, 0, 5)
  }

  return buildStyledXlsx({ name: x.invoice.id.replace(/\//g, '-'), cols, rows, merges, image })
}

/** The logo as PNG bytes and its natural size, or null if it can't load. */
export async function loadLogo(src = '/Logo.png'): Promise<InvoiceExcelInput['logo']> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    const bmp = await createImageBitmap(blob)
    const size = { width: bmp.width, height: bmp.height }
    bmp.close()
    return { png: new Uint8Array(await blob.arrayBuffer()), ...size }
  } catch {
    return null
  }
}
