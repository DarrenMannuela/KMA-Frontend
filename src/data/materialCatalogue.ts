import { SAI_FABRICS, saiFabricColors, isSaiSupplier } from './saiCatalogue'

// "Pick from a supplier's catalogue" as a generic feature: a supplier can
// have a reference material list (and, per material, colour swatches)
// attached by registering it below — the Kas Bon form reads only this
// registry, never a specific supplier's data file directly, so adding the
// next supplier's catalogue (once real data for one exists) is "write its
// data file, add one entry here," not a change to the form itself.
export interface CatalogueColor {
  code: string
  category: string | null
  hex: string
}

export interface CatalogueMaterial {
  name: string
  brand: string
  composition: string
  usedFor: string
  /** A fabric's roll size — omitted for a catalogue whose materials aren't
   *  sold by the roll (e.g. a future trims/notions supplier). */
  widthCm?: number
  rollYards?: number
  /** This catalogue's own stable id for the material — a colour-data key
   *  for SAI's (see saiCatalogue.ts); any unique string for a future one. */
  slug: string
}

export interface SupplierCatalogue {
  /** A short id for this catalogue, used only to namespace its <datalist>. */
  id: string
  /** Whether a given supplier name is this catalogue's own supplier. */
  matchesSupplier: (supplierName: string | undefined | null) => boolean
  materials: CatalogueMaterial[]
  colorsFor: (material: CatalogueMaterial) => CatalogueColor[]
}

// Every registered supplier catalogue. SAI is the only one with real data
// right now (see saiCatalogue.ts) — a second supplier's catalogue is added
// the same way: its own data file, one more entry here.
const CATALOGUES: SupplierCatalogue[] = [
  { id: 'sai', matchesSupplier: isSaiSupplier, materials: SAI_FABRICS, colorsFor: saiFabricColors },
]

/** The catalogue registered for this supplier name, if any. */
export function catalogueForSupplier(supplierName: string | undefined | null): SupplierCatalogue | undefined {
  if (!supplierName) return undefined
  return CATALOGUES.find(c => c.matchesSupplier(supplierName))
}

/** For rendering every registered catalogue's <datalist> up front, since a
 *  Kas Bon form can have several lines, each possibly a different supplier. */
export const ALL_CATALOGUES = CATALOGUES

/** "VERLANDO - JAPAN DRILL" — the form used as both the datalist option and
 *  the stored material_name, matching the all-caps convention Kas Bon lines
 *  already use for everything else. */
export const materialLabel = (m: CatalogueMaterial) => `${m.brand.toUpperCase()} - ${m.name.toUpperCase()}`

/** A material in the given catalogue matching this text — exactly, or as
 *  the prefix of "LABEL - COLOURCODE" once a colour's been appended. Lets
 *  the hint and swatch picker keep working on a line whose name already
 *  carries a picked colour, not just the bare material label. */
export function materialFromText(catalogue: SupplierCatalogue, text: string): CatalogueMaterial | undefined {
  const upper = text.trim().toUpperCase()
  return catalogue.materials.find(m => materialLabel(m) === upper)
    ?? catalogue.materials.find(m => upper.startsWith(`${materialLabel(m)} - `))
}

/** The colour code already appended to this line's name, if any — so the
 *  matching swatch can be highlighted and its number shown as text, not
 *  just conveyed by an un-hoverable swatch color. */
export function colorCodeFromText(material: CatalogueMaterial, text: string): string | undefined {
  const prefix = `${materialLabel(material)} - `
  const upper = text.trim().toUpperCase()
  return upper.startsWith(prefix) ? upper.slice(prefix.length) : undefined
}

/** The swatch already picked for this line, if its name carries a
 *  recognized "LABEL - COLOURCODE" suffix for the given supplier — one
 *  call replacing the catalogue → material → code → swatch chase, for
 *  anywhere that just wants "is there a known colour here" (the Ledger's
 *  own rows, not just the Kas Bon entry form that originally picked it). */
export function colorFromText(supplierName: string | undefined | null, text: string): CatalogueColor | undefined {
  const catalogue = catalogueForSupplier(supplierName)
  const material = catalogue && materialFromText(catalogue, text)
  const code = material && colorCodeFromText(material, text)
  return code ? catalogue!.colorsFor(material!).find(c => c.code === code) : undefined
}
