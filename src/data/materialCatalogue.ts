import type { Supplier, SupplierMaterial, SupplierMaterialColor } from '@/types'

// "Pick from a supplier's catalogue" as a generic feature: every supplier's
// catalogue lives in the database (SupplierMaterial/SupplierMaterialColor,
// managed from the Suppliers page) and is turned into the SupplierCatalogue
// shape below by supplierCatalogueFromDb, so nothing downstream of
// catalogueForSupplier needs to know or care which supplier it's looking at.
// SAI used to be the one exception — a hand-written fallback list checked
// into this repo — until its real catalogue was migrated into the database
// too (2026-11-01), at which point that file was deleted.
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
  /** This catalogue's own stable id for the material — the database row's
   *  own id (stringified), from supplierCatalogueFromDb. */
  slug: string
  /** The supplier's current price for this material. */
  price?: number
}

export interface SupplierCatalogue {
  /** A short id for this catalogue, used only to namespace its <datalist>. */
  id: string
  /** Whether a given supplier name is this catalogue's own supplier. */
  matchesSupplier: (supplierName: string | undefined | null) => boolean
  materials: CatalogueMaterial[]
  colorsFor: (material: CatalogueMaterial) => CatalogueColor[]
}

/** Every supplier's catalogue is database-backed (see supplierCatalogueFromDb
 *  below) and merged in by useSupplierCatalogues() — there's no static
 *  registry left to fall back to, so every call site needs live data from
 *  that hook to get a catalogue match at all. */
export const ALL_CATALOGUES: SupplierCatalogue[] = []

/** The catalogue registered for this supplier name, if any. Pass the merged
 *  list from useSupplierCatalogues() — without it, no supplier matches. */
export function catalogueForSupplier(
  supplierName: string | undefined | null,
  catalogues: SupplierCatalogue[] = ALL_CATALOGUES,
): SupplierCatalogue | undefined {
  if (!supplierName) return undefined
  return catalogues.find(c => c.matchesSupplier(supplierName))
}

/** Turns one supplier's database catalogue (SupplierMaterial rows, plus
 *  their colours grouped by material id — see supplierMaterialColorHooks.
 *  useGrouped) into the SupplierCatalogue shape the Kas Bon picker, the
 *  Ledger's swatch and everything else that reads one actually consumes. */
export function supplierCatalogueFromDb(
  supplier: Supplier,
  materials: SupplierMaterial[],
  colorsByMaterial: Record<string, SupplierMaterialColor[]>,
): SupplierCatalogue {
  const toMaterial = (m: SupplierMaterial): CatalogueMaterial => ({
    name: m.name,
    brand: m.brand ?? '',
    composition: m.composition ?? '',
    usedFor: m.used_for ?? '',
    widthCm: m.width_cm ?? undefined,
    rollYards: m.roll_yards ?? undefined,
    slug: String(m.id),
    price: m.price,
  })
  const toColor = (c: SupplierMaterialColor): CatalogueColor => ({ code: c.code, category: c.category, hex: c.hex })
  return {
    id: `supplier-${supplier.id}`,
    matchesSupplier: name => name === supplier.supplier_name,
    materials: materials.map(toMaterial),
    colorsFor: material => (colorsByMaterial[material.slug] ?? []).map(toColor),
  }
}

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
export function colorFromText(
  supplierName: string | undefined | null,
  text: string,
  catalogues: SupplierCatalogue[] = ALL_CATALOGUES,
): CatalogueColor | undefined {
  const catalogue = catalogueForSupplier(supplierName, catalogues)
  const material = catalogue && materialFromText(catalogue, text)
  const code = material && colorCodeFromText(material, text)
  return code ? catalogue!.colorsFor(material!).find(c => c.code === code) : undefined
}
