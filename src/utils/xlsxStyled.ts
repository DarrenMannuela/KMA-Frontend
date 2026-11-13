// A formatted .xlsx sheet without a library: fonts, fills, borders,
// alignment, number formats, merged cells, column widths, row heights,
// formulas, one picture and A4 page setup. For documents laid out like a
// printed page (the invoice); plain tables use buildXlsx in xlsx.ts.

import { zip, esc, colName } from './xlsx'

export type XBorderStyle = 'thin' | 'medium' | 'double' | 'hair'
export interface XBorder { style: XBorderStyle; color?: string }

export interface XStyle {
  font?: string
  /** Points. */
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** '#rrggbb'. */
  color?: string
  fill?: string
  h?: 'left' | 'center' | 'right'
  v?: 'top' | 'center' | 'bottom'
  wrap?: boolean
  indent?: number
  /** An Excel number format, e.g. '#,##0'. */
  numFmt?: string
  border?: { top?: XBorder; right?: XBorder; bottom?: XBorder; left?: XBorder }
}

export interface XCell {
  v?: string | number | null
  /** A formula without the '='; `v` is its value until Excel recalculates. */
  f?: string
  s?: XStyle
}

export interface XRow {
  /** Points; left out, Excel sizes the row itself. */
  height?: number
  cells: (XCell | undefined)[]
}

export interface StyledSheet {
  name: string
  /** Column widths in Excel's units (characters of the default font). */
  cols: number[]
  rows: XRow[]
  /** e.g. 'A1:F1'. */
  merges?: string[]
  /** A PNG placed at x/y pixels from the sheet's top-left, at width × height pixels. */
  image?: { png: Uint8Array; x: number; y: number; width: number; height: number }
  /** A4 portrait, fitted to one page wide. */
  print?: { margins?: { left: number; right: number; top: number; bottom: number } }
}

/** A column's width in pixels, as Excel draws it with the default font
 *  (Calibri 11, 7px digits). */
export const colPx = (width: number) => Math.trunc(width * 7 + 5)
/** The column width that is this many pixels wide. */
export const pxToCol = (px: number) => Math.max(0, (px - 5) / 7)
const DEFAULT_ROW_PT = 15
const EMU_PER_PX = 9525
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padStart(6, '0').slice(-6)}`

/** Styles, each part shared by every cell that uses it. */
class Styles {
  private fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']
  private fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  private borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  private numFmts: string[] = []
  private xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  private index = new Map<string, number>()

  private add(list: string[], xml: string): number {
    const i = list.indexOf(xml)
    if (i >= 0) return i
    list.push(xml)
    return list.length - 1
  }

  id(s: XStyle | undefined): number {
    if (!s) return 0
    const key = JSON.stringify(s)
    const known = this.index.get(key)
    if (known != null) return known

    const font = this.add(this.fonts, `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}${s.underline ? '<u/>' : ''}<sz val="${s.size ?? 11}"/>${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}<name val="${esc(s.font ?? 'Calibri')}"/></font>`)
    const fill = s.fill ? this.add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0
    const side = (name: string, b?: XBorder) => b ? `<${name} style="${b.style}"><color rgb="${argb(b.color ?? '#000000')}"/></${name}>` : `<${name}/>`
    const b = s.border
    const border = b ? this.add(this.borders, `<border>${side('left', b.left)}${side('right', b.right)}${side('top', b.top)}${side('bottom', b.bottom)}<diagonal/></border>`) : 0
    let numFmt = 0
    if (s.numFmt) numFmt = 164 + this.add(this.numFmts, s.numFmt)
    const align = s.h || s.v || s.wrap || s.indent
      ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}${s.indent ? ` indent="${s.indent}"` : ''}/>`
      : ''
    const xf = `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${numFmt ? ' applyNumberFormat="1"' : ''}${align ? ' applyAlignment="1"' : ''}>${align}</xf>`
    const id = this.add(this.xfs, xf)
    this.index.set(key, id)
    return id
  }

  xml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : ''}
<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>
<fills count="${this.fills.length}">${this.fills.join('')}</fills>
<borders count="${this.borders.length}">${this.borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
  }
}

function sheetXml(sheet: StyledSheet, styles: Styles): string {
  const rows = sheet.rows.map((row, ri) => {
    const r = ri + 1
    const cells = row.cells.map((c, ci) => {
      if (!c) return ''
      const ref = `${colName(ci)}${r}`
      const s = styles.id(c.s)
      const sAttr = s ? ` s="${s}"` : ''
      if (c.f) {
        const cached = typeof c.v === 'number' && Number.isFinite(c.v) ? `<v>${c.v}</v>` : ''
        return `<c r="${ref}"${sAttr}><f>${esc(c.f)}</f>${cached}</c>`
      }
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`
      if (c.v == null || c.v === '') return s ? `<c r="${ref}"${sAttr}/>` : ''
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`
    }).join('')
    const ht = row.height != null ? ` ht="${Math.round(row.height * 4) / 4}" customHeight="1"` : ''
    return `<row r="${r}"${ht}>${cells}</row>`
  }).join('')
  const cols = sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 100) / 100}" customWidth="1"/>`).join('')
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  const m = sheet.print?.margins ?? { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6 }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="${DEFAULT_ROW_PT}"/>
<cols>${cols}</cols><sheetData>${rows}</sheetData>${merges}
<printOptions horizontalCentered="1"/>
<pageMargins left="${m.left}" right="${m.right}" top="${m.top}" bottom="${m.bottom}" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
${sheet.image ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`
}

/** Where x/y pixels fall in the grid: a cell and the offset inside it. */
function anchorAt(sheet: StyledSheet, x: number, y: number) {
  let col = 0
  let left = x
  while (col < sheet.cols.length - 1 && left >= colPx(sheet.cols[col])) { left -= colPx(sheet.cols[col]); col++ }
  let row = 0
  let top = y
  const rowPx = (i: number) => ((sheet.rows[i]?.height ?? DEFAULT_ROW_PT) * 4) / 3
  while (row < sheet.rows.length - 1 && top >= rowPx(row)) { top -= rowPx(row); row++ }
  return { col, colOff: Math.round(left * EMU_PER_PX), row, rowOff: Math.round(top * EMU_PER_PX) }
}

function drawingXml(sheet: StyledSheet): string {
  const img = sheet.image!
  const a = anchorAt(sheet, img.x, img.y)
  const cx = Math.round(img.width * EMU_PER_PX)
  const cy = Math.round(img.height * EMU_PER_PX)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>${a.colOff}</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>${a.rowOff}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>
<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
}

/** A one-sheet .xlsx workbook laid out as given. */
export function buildStyledXlsx(sheet: StyledSheet): Blob {
  const enc = new TextEncoder()
  const styles = new Styles()
  const sheetText = sheetXml(sheet, styles) // registers the styles it uses
  const name = esc(sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1')
  const hasImage = !!sheet.image
  const text = (n: string, t: string) => ({ name: n, data: enc.encode(t) })
  const files: { name: string; data: Uint8Array }[] = [
    text('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${hasImage ? '<Default Extension="png" ContentType="image/png"/>' : ''}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
${hasImage ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
</Types>`),
    text('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    text('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    text('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    text('xl/worksheets/sheet1.xml', sheetText),
    text('xl/styles.xml', styles.xml()),
  ]
  if (sheet.image) {
    files.push(
      text('xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`),
      text('xl/drawings/drawing1.xml', drawingXml(sheet)),
      text('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`),
      { name: 'xl/media/image1.png', data: sheet.image.png },
    )
  }
  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
