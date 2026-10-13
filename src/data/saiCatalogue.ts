import fabricColors from './saiFabricColors.json'
import type { CatalogueColor, CatalogueMaterial } from './materialCatalogue'

// The real fabric list from Sumber Agung Internusa (SAI), the workshop's own
// fabric supplier — mirrored from pattern-app's backend/catalog/fabric.go
// (Composition/UsedFor translated from each fabric's own product page there).
// A fixed reference list, not live pricing or stock — update it by hand as
// the supplier's catalogue changes. This file is SAI's own data only; the
// generic "pick from a supplier's catalogue" feature lives in
// materialCatalogue.ts, which registers this as one of possibly several
// suppliers' catalogues.
export const SAI_FABRICS: CatalogueMaterial[] = [
  { name: 'CP American Drill', brand: 'Verlando', composition: '65% polyester, 35% rayon', usedFor: 'Big-event uniforms, factory workwear, tablecloths, curtains, seat covers', widthCm: 150, rollYards: 30, slug: 'verlando-cp-american-drill' },
  { name: 'Bultop', brand: 'Verlando', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Vests, security/satpol PP uniforms, safari wear, jackets, bags, hats', widthCm: 150, rollYards: 30, slug: 'verlando-bulltop' },
  { name: 'Japan Drill', brand: 'Verlando', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Chef/cook uniforms, security, office shirts, martial arts, hats', widthCm: 150, rollYards: 30, slug: 'verlando-japan-drill' },
  { name: 'Blue Jeans Series', brand: 'Verlando', composition: '65% polyester, 35% cotton', usedFor: 'Automotive showroom uniforms, large-scale promotional wear, outdoor uniforms, hats', widthCm: 150, rollYards: 30, slug: 'verlando-blue-jeans-series' },
  { name: 'Tropical Deluxe', brand: 'Verlando', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Hospital, cleaning-service, office-boy and food-industry uniforms', widthCm: 150, rollYards: 30, slug: 'verlando-tropical' },
  { name: 'Gabardine Deluxe', brand: 'Verlando', composition: '100% polyester', usedFor: 'Factory workwear, large-scale events, seat/cushion covers', widthCm: 150, rollYards: 30, slug: 'verlando-gabardine-deluxe' },
  { name: 'Plat', brand: 'Verlando', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'School uniforms, hansip and satpam uniforms', widthCm: 150, rollYards: 30, slug: 'verlando-plat' },
  { name: 'Basic', brand: 'Verlando', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'School uniforms, light industrial workwear, catering uniforms, promotional wear, hats', widthCm: 150, rollYards: 30, slug: 'verlando-basic' },
  { name: 'Tropical Deluxe', brand: 'Maryland', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Hospital, cleaning-service, office-boy and food-industry uniforms, outdoor wear', widthCm: 150, rollYards: 30, slug: 'maryland-tropical' },
  { name: 'USA Fine Twill', brand: 'Maryland', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Factory and field-worker uniforms, tablecloths, curtains, seat/cushion covers', widthCm: 150, rollYards: 30, slug: 'maryland-usa-fine-twill' },
  { name: 'USA Drill', brand: 'Ventura', composition: '65% tetoron (polyester), 35% rayon', usedFor: 'Government-institution and retail uniforms, field workers, safari wear', widthCm: 150, rollYards: 30, slug: 'ventura-usa-drill' },
  { name: 'USA Drill', brand: 'Venhouston', composition: '100% polyester', usedFor: 'Factory worker uniforms, large-scale events, furniture seat covers', widthCm: 150, rollYards: 30, slug: 'venhouston-usa-drill' },
]

const colorsBySlug = fabricColors as Record<string, CatalogueColor[]>

/** This fabric's colour swatches (code + hex, sometimes a usage category) —
 *  empty for the two entries pattern-app has no colour data for yet
 *  (Basic, Blue Jeans Series). */
export const saiFabricColors = (f: CatalogueMaterial): CatalogueColor[] => colorsBySlug[f.slug] ?? []

/** Whether a supplier is SAI — matched by name (contains "SAI" as a whole
 *  word, or "SUMBER AGUNG") rather than a fixed id, since the id is
 *  assigned whenever that supplier record is created. */
export const isSaiSupplier = (supplierName: string | undefined | null) => {
  if (!supplierName) return false
  const n = supplierName.toUpperCase()
  return /\bSAI\b/.test(n) || n.includes('SUMBER AGUNG')
}
