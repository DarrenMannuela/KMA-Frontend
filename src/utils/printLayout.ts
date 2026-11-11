// How each printed document is laid out: its font, where the logo sits and
// how big, the size of each part's text and the spacing between parts.
// One layout per kind of document, saved on the server for everyone (see
// usePrintLayout); each document's defaults are exactly how it printed
// before layouts existed, so an untouched document looks the same.

export type PrintDocType = 'invoice' | 'kwitansi' | 'sj' | 'do'

export type LogoPosition = 'left' | 'center' | 'right' | 'none'

export type PrintFont = 'default' | 'arial' | 'helvetica' | 'verdana' | 'cambria' | 'georgia' | 'times'

export interface PrintLayout {
  font: PrintFont
  logoPosition: LogoPosition
  /** Logo width, px. */
  logoSize: number
  /** "KREASI MAKMUR ABADI", px. */
  companySize: number
  /** The document's title (INVOICE, KWITANSI, SURAT JALAN NO. …), px. */
  titleSize: number
  /** The block of details under the header (client, dates, numbers), px. */
  detailsSize: number
  /** The item table or main text, px. */
  bodySize: number
  /** Signatures, notes and the footer, px. */
  footerSize: number
  /** Gaps between the parts, as a multiple of the built-in gaps. */
  spacing: number
}

export const PRINT_DEFAULTS: Record<PrintDocType, PrintLayout> = {
  invoice:  { font: 'default', logoPosition: 'left', logoSize: 90, companySize: 11.5, titleSize: 27, detailsSize: 11, bodySize: 11.5, footerSize: 10.5, spacing: 1 },
  kwitansi: { font: 'default', logoPosition: 'left', logoSize: 80, companySize: 14, titleSize: 26, detailsSize: 13, bodySize: 13, footerSize: 13, spacing: 1 },
  sj:       { font: 'default', logoPosition: 'left', logoSize: 64, companySize: 20, titleSize: 16, detailsSize: 12, bodySize: 10.5, footerSize: 10.5, spacing: 1 },
  do:       { font: 'default', logoPosition: 'left', logoSize: 64, companySize: 20, titleSize: 16, detailsSize: 12, bodySize: 10.5, footerSize: 10.5, spacing: 1 },
}

/** The CSS font stacks. "default" is each document's own (Arial, with
 *  Cambria for the invoice's title, notes and signatures). */
export const PRINT_FONTS: Record<Exclude<PrintFont, 'default'>, { label: string; stack: string }> = {
  arial:     { label: 'Arial', stack: 'Arial, sans-serif' },
  helvetica: { label: 'Helvetica', stack: "Helvetica, 'Helvetica Neue', Arial, sans-serif" },
  verdana:   { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  cambria:   { label: 'Cambria', stack: "Cambria, Georgia, 'Times New Roman', serif" },
  georgia:   { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  times:     { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
}

/** Each number's allowed range and step, shared by the panel's sliders and
 *  by reading a saved layout (anything out of range is pulled back in). */
export const PRINT_LIMITS = {
  logoSize:    { min: 30, max: 180, step: 2 },
  companySize: { min: 8, max: 36, step: 0.5 },
  titleSize:   { min: 10, max: 48, step: 1 },
  detailsSize: { min: 8, max: 20, step: 0.5 },
  bodySize:    { min: 8, max: 20, step: 0.5 },
  footerSize:  { min: 8, max: 20, step: 0.5 },
  spacing:     { min: 0.5, max: 2, step: 0.05 },
} as const satisfies Partial<Record<keyof PrintLayout, { min: number; max: number; step: number }>>

const LOGO_POSITIONS: LogoPosition[] = ['left', 'center', 'right', 'none']

/** A saved layout made safe: missing or unknown values fall back to the
 *  document's defaults, numbers are kept in range. */
export function resolvePrintLayout(docType: PrintDocType, saved: unknown): PrintLayout {
  const base = PRINT_DEFAULTS[docType]
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  const out: PrintLayout = { ...base }
  if (typeof s.font === 'string' && (s.font === 'default' || s.font in PRINT_FONTS)) out.font = s.font as PrintFont
  if (typeof s.logoPosition === 'string' && LOGO_POSITIONS.includes(s.logoPosition as LogoPosition)) out.logoPosition = s.logoPosition as LogoPosition
  for (const [key, { min, max }] of Object.entries(PRINT_LIMITS) as [keyof typeof PRINT_LIMITS, { min: number; max: number }][]) {
    const v = s[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(max, Math.max(min, v))
  }
  return out
}

/** The font stacks a document uses: its main text, and the one for parts
 *  that are serif by default (the invoice's title, notes and signatures). */
export function printFontStacks(layout: PrintLayout): { main: string; serif: string } {
  if (layout.font === 'default') return { main: PRINT_FONTS.arial.stack, serif: PRINT_FONTS.cambria.stack }
  const stack = PRINT_FONTS[layout.font].stack
  return { main: stack, serif: stack }
}

export const samePrintLayout = (a: PrintLayout, b: PrintLayout) =>
  (Object.keys(a) as (keyof PrintLayout)[]).every(k => a[k] === b[k])
