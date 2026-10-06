// Excel files without a library: a writer for .xlsx (numbers stay numbers,
// dates stay dates, money gets thousands separators) and a reader for the
// first sheet of an .xlsx. Both use the zip container directly; the reader
// inflates with the browser's DecompressionStream.

import type { Cell, Grid } from './tableText'

// ── Zip ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip of the given files, stored without compression. */
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, 0, true) // stored
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    chunks.push(new Uint8Array(local.buffer), name, f.data)

    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, f.data.length, true)
    dir.setUint32(24, f.data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buf)
  let end = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('Not an Excel file (no zip directory found)')
  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const out = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localAt = view.getUint32(p + 42, true)
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!wanted(name)) continue
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true)
    const raw = new Uint8Array(buf, dataAt, size)
    if (method === 0) {
      out.set(name, dec.decode(raw))
    } else if (method === 8) {
      const stream = new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.set(name, await new Response(stream).text())
    } else {
      throw new Error(`Unsupported compression in ${name}`)
    }
  }
  return out
}

// ── Writing ──────────────────────────────────────────────────────────────────

export type ColumnKind = 'text' | 'money' | 'number' | 'date'

export interface SheetSpec {
  name: string
  columns: { header: string; kind?: ColumnKind; width?: number }[]
  rows: (Cell | null | undefined)[][]
  /** A bold totals row under the data: column index → value. */
  totals?: Record<number, Cell>
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  // Characters XML 1.0 doesn't allow at all.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function colName(i: number): string {
  let s = ''
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

function excelDate(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000
}

// Style ids in STYLES below.
const S = { text: 0, header: 1, money: 2, number: 3, date: 4, totalLabel: 5, totalMoney: 6 }
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF5"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

function sheetXml(spec: SheetSpec): string {
  const cell = (ref: string, v: Cell | null | undefined, kind: ColumnKind = 'text', style?: number) => {
    if (v == null || v === '') return ''
    if (kind === 'date' && typeof v === 'string') {
      const serial = excelDate(v)
      if (serial != null) return `<c r="${ref}" s="${style ?? S.date}"><v>${serial}</v></c>`
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      const s = style ?? (kind === 'money' ? S.money : S.number)
      return `<c r="${ref}" s="${s}"><v>${v}</v></c>`
    }
    return `<c r="${ref}" t="inlineStr"${style != null ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
  }
  const rows: string[] = []
  rows.push(`<row r="1">${spec.columns.map((c, i) => cell(`${colName(i)}1`, c.header, 'text', S.header)).join('')}</row>`)
  spec.rows.forEach((r, ri) => {
    const n = ri + 2
    rows.push(`<row r="${n}">${spec.columns.map((c, i) => cell(`${colName(i)}${n}`, r[i], c.kind)).join('')}</row>`)
  })
  if (spec.totals) {
    const n = spec.rows.length + 2
    rows.push(`<row r="${n}">${spec.columns.map((c, i) => {
      const v = spec.totals![i]
      return cell(`${colName(i)}${n}`, v, c.kind, typeof v === 'number' ? S.totalMoney : S.totalLabel)
    }).join('')}</row>`)
  }
  const last = `${colName(spec.columns.length - 1)}${spec.rows.length + 1}`
  const cols = spec.columns.map((c, i) => {
    const width = c.width ?? Math.min(48, Math.max(10, c.header.length + 2, ...spec.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2)))
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${spec.rows.length ? `<autoFilter ref="A1:${last}"/>` : ''}</worksheet>`
}

/** An .xlsx workbook with one sheet per spec. */
export function buildXlsx(sheets: SheetSpec[]): Blob {
  const enc = new TextEncoder()
  const names = sheets.map((s, i) => esc(s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || `Sheet${i + 1}`))
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}
</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'xl/styles.xml', text: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ]
  const bytes = zip(files.map(f => ({ name: f.name, data: enc.encode(f.text) })))
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Reading ──────────────────────────────────────────────────────────────────

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

/** The first sheet of an .xlsx file as rows of text and numbers. */
export async function readXlsx(buf: ArrayBuffer): Promise<Grid> {
  const files = await unzip(buf, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
    n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'))
  const parse = (name: string) => {
    const text = files.get(name)
    return text ? new DOMParser().parseFromString(text, 'application/xml') : null
  }
  const workbook = parse('xl/workbook.xml')
  const rels = parse('xl/_rels/workbook.xml.rels')
  const firstSheet = workbook?.getElementsByTagName('sheet')[0]
  const rid = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
  let target = 'worksheets/sheet1.xml'
  for (const r of Array.from(rels?.getElementsByTagName('Relationship') ?? [])) {
    if (r.getAttribute('Id') === rid) target = r.getAttribute('Target') ?? target
  }
  const sheet = parse(target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  if (!sheet) throw new Error('The workbook has no sheet to read')

  const shared = Array.from(parse('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])
    .map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join(''))

  const grid: Grid = []
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const r = Number(row.getAttribute('r') ?? grid.length + 1) - 1
    const cells: Cell[] = []
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') ?? '')
      const t = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let value: Cell
      if (t === 's') value = shared[Number(v)] ?? ''
      else if (t === 'inlineStr') value = Array.from(c.getElementsByTagName('t')).map(x => x.textContent ?? '').join('')
      else if (t === 'str' || t === 'b' || t === 'e') value = v
      else value = v === '' ? '' : Number(v)
      while (cells.length < i) cells.push('')
      cells[i] = typeof value === 'string' ? value.trim() : value
    }
    grid[r] = cells
  }
  return Array.from(grid, r => r ?? []).filter(r => r.some(c => c !== ''))
}
