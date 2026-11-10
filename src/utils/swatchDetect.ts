import { rgbDistance, type RGB } from './colour'

// Finding the colour swatches on a page of a supplier's catalogue (a PDF page
// or a photo, already drawn into pixels), so their colours can be read off
// without clicking each one. Built for what these catalogues look like: a
// scanned or photographed swatch card, a grid of fabric patches on white or
// light paper, a number above each, sometimes a watermark across them.
//
// The page is cut into small blocks. A block counts as "swatch" when it's
// evenly coloured (fabric texture and scan noise are allowed for) and clearly
// not the paper. Touching swatch blocks of the same colour join into one
// patch; patches too small, too big, too thin or too ragged to be a swatch
// are dropped; and the two halves of a swatch cut by a line of watermark
// text are put back together.

export interface Box { x: number; y: number; w: number; h: number }
export interface DetectedSwatch extends Box { rgb: RGB }

const BLOCK = 4

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/** The page's paper: the most common bright, mildly coloured colour (by
 *  count, not a middle value, so a page with large pale swatches or a grey
 *  panel still gets its real background). White when the page has too
 *  little of it to tell (a photo with no card in it). */
export function paperColour(img: ImageData): RGB {
  const { data } = img
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let bright = 0
  for (let i = 0; i < data.length; i += 4 * 2) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    // Bright and only mildly coloured: paper under a warm lamp or cool
    // daylight is tinted (that tint is what the correction takes out).
    if (luma(r, g, b) <= 150 || Math.max(r, g, b) - Math.min(r, g, b) >= 80) continue
    bright++
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    const e = buckets.get(key)
    if (e) { e.n++; e.r += r; e.g += g; e.b += b } else buckets.set(key, { n: 1, r, g, b })
  }
  if (bright < data.length / 4 / 2 / 100) return [255, 255, 255]
  let best = { n: 0, r: 255, g: 255, b: 255 }
  for (const e of buckets.values()) if (e.n > best.n) best = e
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)]
}

/** The middle colour of a box (per-channel median of its inner part), so a
 *  pinked edge, a printed number or watermark text inside it doesn't sway it. */
export function boxColour(img: ImageData, box: Box, inset = 0.22): RGB {
  const x0 = Math.max(0, Math.round(box.x + box.w * inset)), x1 = Math.min(img.width, Math.round(box.x + box.w * (1 - inset)))
  const y0 = Math.max(0, Math.round(box.y + box.h * inset)), y1 = Math.min(img.height, Math.round(box.y + box.h * (1 - inset)))
  const rs: number[] = [], gs: number[] = [], bs: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2])
    }
  }
  if (!rs.length) return [128, 128, 128]
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)] }
  return [med(rs), med(gs), med(bs)]
}

export function detectSwatches(img: ImageData, paper: RGB = paperColour(img)): DetectedSwatch[] {
  const W = img.width, H = img.height
  const bw = Math.floor(W / BLOCK), bh = Math.floor(H / BLOCK)
  const mean = new Float32Array(bw * bh * 3)
  const ink = new Uint8Array(bw * bh)

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0
      for (let y = by * BLOCK; y < by * BLOCK + BLOCK; y++) {
        for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) {
          const i = (y * W + x) * 4
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
          const l = luma(r, g, b)
          sr += r; sg += g; sb += b; sl += l; sl2 += l * l
        }
      }
      const n = BLOCK * BLOCK
      const k = by * bw + bx
      const m: RGB = [sr / n, sg / n, sb / n]
      mean[k * 3] = m[0]; mean[k * 3 + 1] = m[1]; mean[k * 3 + 2] = m[2]
      const std = Math.sqrt(Math.max(0, sl2 / n - (sl / n) ** 2))
      // A textured, clearly-coloured block (scanned or photographed fabric),
      // or a perfectly flat one only slightly off the paper (a pale swatch in
      // a digital PDF, printed as one exact colour).
      const d = rgbDistance(m, paper)
      ink[k] = (d > 40 && std < 26) || (d > 7 && std < 2.5) || (d > 4 && std < 1) ? 1 : 0
    }
  }

  // Join touching swatch blocks of a similar colour.
  const label = new Int32Array(bw * bh).fill(-1)
  const comps: { x0: number; y0: number; x1: number; y1: number; count: number }[] = []
  const stack: number[] = []
  const blockRgb = (k: number): RGB => [mean[k * 3], mean[k * 3 + 1], mean[k * 3 + 2]]
  for (let k = 0; k < bw * bh; k++) {
    if (!ink[k] || label[k] >= 0) continue
    const id = comps.length
    const c = { x0: bw, y0: bh, x1: 0, y1: 0, count: 0 }
    label[k] = id; stack.push(k)
    while (stack.length) {
      const cur = stack.pop()!
      const cx = cur % bw, cy = (cur - cx) / bw
      c.count++
      c.x0 = Math.min(c.x0, cx); c.x1 = Math.max(c.x1, cx); c.y0 = Math.min(c.y0, cy); c.y1 = Math.max(c.y1, cy)
      const here = blockRgb(cur)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const nk = ny * bw + nx
        if (!ink[nk] || label[nk] >= 0) continue
        if (rgbDistance(here, blockRgb(nk)) > 28) continue
        label[nk] = id; stack.push(nk)
      }
    }
    comps.push(c)
  }

  // Patches shaped like a swatch: big enough to be one, not a whole photo
  // or banner, not a thin line, and mostly filled in.
  const minSide = Math.max(3, Math.round((W * 0.035) / BLOCK))
  let boxes = comps
    .map(c => ({ x0: c.x0, y0: c.y0, x1: c.x1 + 1, y1: c.y1 + 1, count: c.count }))
    .filter(c => {
      const w = c.x1 - c.x0, h = c.y1 - c.y0
      return w >= minSide && h >= minSide / 2 && w < bw * 0.45 && h < bh * 0.4 && w / h <= 4 && h / w <= 3
    })

  // A line of watermark text across a swatch splits it in two: put halves
  // back together when they're stacked, line up, and are the same colour.
  const colourOf = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    boxColour(img, { x: b.x0 * BLOCK, y: b.y0 * BLOCK, w: (b.x1 - b.x0) * BLOCK, h: (b.y1 - b.y0) * BLOCK }, 0.15)
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue
        const a = boxes[i], b = boxes[j]
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        const gap = b.y0 - a.y1
        if (gap < 0 || gap > 4 || overlapX < 0.7 * Math.min(a.x1 - a.x0, b.x1 - b.x0)) continue
        if (rgbDistance(colourOf(a), colourOf(b)) > 30) continue
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: a.y0, x1: Math.max(a.x1, b.x1), y1: b.y1, count: a.count + b.count + gap * overlapX }
        boxes.splice(j, 1)
        merged = true
        break outer
      }
    }
  }

  boxes = boxes.filter(c => {
    const w = c.x1 - c.x0, h = c.y1 - c.y0
    return h >= minSide && c.count / (w * h) >= 0.5 && w / h <= 3.5 && h / w <= 3
  })

  return boxes.map(c => {
    const box = { x: c.x0 * BLOCK, y: c.y0 * BLOCK, w: (c.x1 - c.x0) * BLOCK, h: (c.y1 - c.y0) * BLOCK }
    return { ...box, rgb: boxColour(img, box) }
  })
}

/** On a swatch card the swatches are all about the same size: once there
 *  are enough of them to tell, drop what isn't (a face in a model photo, a
 *  sliver of a white swatch). Only for pages without printed codes; where
 *  codes are printed, they decide what's a swatch (see assignLabels). */
export function consistentSize<T extends Box>(boxes: T[]): T[] {
  if (boxes.length < 4) return boxes
  const mw = median(boxes.map(b => b.w)), mh = median(boxes.map(b => b.h))
  return boxes.filter(b => b.w >= mw * 0.6 && b.w <= mw * 1.7 && b.h >= mh * 0.6 && b.h <= mh * 1.7)
}

/** A piece of text on the page, in the same units as the swatch boxes. */
export interface TextLabel extends Box { text: string }

/** Words on one line that sit next to each other become one label, so
 *  "59 - M" or "023 - T" stays one code. */
export function joinLabels(items: TextLabel[]): TextLabel[] {
  // Lines first (pieces whose baselines line up), then left to right
  // within a line, so only true neighbours are ever joined.
  const byBaseline = items.filter(i => i.text.trim()).sort((a, b) => a.y + a.h - (b.y + b.h))
  const lines: TextLabel[][] = []
  for (const it of byBaseline) {
    const line = lines[lines.length - 1]
    const ref = line?.[0]
    if (ref && Math.abs(ref.y + ref.h - (it.y + it.h)) < Math.min(ref.h, it.h) * 0.4) line.push(it)
    else lines.push([it])
  }
  const out: TextLabel[] = []
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x)
    let cur: TextLabel | null = null
    for (const it of line) {
      const gap: number = cur ? it.x - (cur.x + cur.w) : Infinity
      // Neighbours of a similar size only: a code and the small caption next
      // to it ("150" and "PEMASYARAKATAN") are separate things.
      const similar = cur && Math.max(cur.h, it.h) / Math.min(cur.h, it.h) < 1.5
      if (cur && similar && gap > -Math.min(cur.h, it.h) * 0.2 && gap < Math.max(cur.h, it.h) * 0.9) {
        // Touching pieces are one word ("00" + "7" is 007); a real gap is a space ("59" "-" "M").
        const sep: string = gap < Math.min(cur.h, it.h) * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.text) ? '' : ' '
        const x1 = Math.max(cur.x + cur.w, it.x + it.w)
        const y0 = Math.min(cur.y, it.y)
        cur = { text: `${cur.text}${sep}${it.text}`, x: cur.x, y: y0, w: x1 - cur.x, h: Math.max(cur.y + cur.h, it.y + it.h) - y0 }
      } else {
        if (cur) out.push(cur)
        cur = { ...it }
      }
    }
    if (cur) out.push(cur)
  }
  return out.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
}

// Looks like a colour code: short, has a digit, no phone numbers or handles.
const isCode = (t: string) => t.length <= 10 && /\d/.test(t) && /^[#A-Z0-9][A-Z0-9 .#/-]*$/i.test(t)
// "(SATPAM)" printed by a code is that colour's category.
const isCategory = (t: string) => /^\(.+\)$/.test(t) && t.length <= 24

/** The code printed beside each swatch (and a category in brackets, when
 *  there is one). Labels sit either above or below their swatches; the side
 *  that matches more swatches is used for the whole page (above, on a tie),
 *  so the label of the next row down isn't taken by mistake. Each label goes
 *  to one swatch only. */
export function assignLabels<T extends Box>(swatches: T[], labels: TextLabel[]): Map<T, { code: string; category: string | null }> {
  // "01 (SATPAM)" on one line is a code and its category.
  const split = labels.flatMap(l => {
    const m = l.text.match(/^(.+?)\s*(\(.+\))$/)
    return m ? [{ ...l, text: m[1].trim() }, { ...l, text: m[2] }] : [l]
  })
  const codes = split.filter(l => isCode(l.text))
  const cats = split.filter(l => isCategory(l.text))
  const fit = (side: 'above' | 'below') => {
    const pairs: { s: T; l: TextLabel; d: number }[] = []
    for (const s of swatches) {
      for (const l of codes) {
        const cx = l.x + l.w / 2
        if (cx < s.x - s.w * 0.15 || cx > s.x + s.w * 1.15) continue
        const d = side === 'above' ? s.y - (l.y + l.h) : l.y - (s.y + s.h)
        if (d < -s.h * 0.15 || d > s.h * 0.8) continue
        pairs.push({ s, l, d: Math.max(0, d) })
      }
    }
    pairs.sort((a, b) => a.d - b.d)
    const usedS = new Set<T>(), usedL = new Set<TextLabel>()
    const chosen = new Map<T, TextLabel>()
    for (const p of pairs) {
      if (usedS.has(p.s) || usedL.has(p.l)) continue
      usedS.add(p.s); usedL.add(p.l); chosen.set(p.s, p.l)
    }
    return { chosen }
  }
  const above = fit('above'), below = fit('below')
  // Above wins a tie: catalogues print a swatch's code over it far more
  // often, and font spacing makes distances too close to call fairly.
  const best = below.chosen.size > above.chosen.size ? below : above
  const result = new Map<T, { code: string; category: string | null }>()
  for (const [s, l] of best.chosen) {
    // A bracketed word right by the code (same line, or the line next to it).
    const cat = cats.find(c => {
      const cx = c.x + c.w / 2
      return cx >= s.x - s.w * 0.2 && cx <= s.x + s.w * 1.2 && Math.abs(c.y + c.h / 2 - (l.y + l.h / 2)) < l.h * 2.2
    })
    const category = cat ? cat.text.slice(1, -1).trim().toLowerCase().replace(/(^|[\s/-])\p{L}/gu, m => m.toUpperCase()) : null
    // A hyphen stuck to the number belongs to it: "145- T" is 145-T, while
    // "59 - M", spaced on both sides, stays as printed.
    const code = l.text.toUpperCase().replace(/(\S)- (\S)/g, '$1-$2').replace(/(\S) -(\S)/g, '$1-$2')
    result.set(s, { code, category })
  }
  return result
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0 }

/** Reading order for a grid of swatches: down each column, then the next
 *  column (how most swatch cards are numbered), or across each row. */
export function orderSwatches<T extends Box>(items: T[], order: 'columns' | 'rows'): T[] {
  if (items.length < 2) return [...items]
  const along = order === 'columns' ? (b: Box) => b.x + b.w / 2 : (b: Box) => b.y + b.h / 2
  const within = order === 'columns' ? (b: Box) => b.y + b.h / 2 : (b: Box) => b.x + b.w / 2
  const size = median(items.map(b => (order === 'columns' ? b.w : b.h)))
  const sorted = [...items].sort((a, b) => along(a) - along(b))
  const groups: T[][] = []
  for (const it of sorted) {
    const g = groups[groups.length - 1]
    if (g && along(it) - along(g[0]) < size * 0.6) g.push(it)
    else groups.push([it])
  }
  return groups.flatMap(g => g.sort((a, b) => within(a) - within(b)))
}

/** Codes counting on from a starting one, keeping its zero-padding and any
 *  letters around the number: "001" → 001, 002…; "LC-07" → LC-07, LC-08… */
export function codeSequence(start: string, count: number): string[] {
  const m = start.trim().match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return Array.from({ length: count }, (_, i) => `${start.trim()}${i + 1}`)
  const [, pre, digits, post] = m
  const first = Number(digits)
  return Array.from({ length: count }, (_, i) => `${pre}${String(first + i).padStart(digits.length, '0')}${post}`)
}
