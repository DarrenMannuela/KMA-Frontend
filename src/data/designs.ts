import type { SupplierDesign } from '@/types'

// A design as a Kas Bon line names it: "LOGO PT CONTOH - DADA KIRI - 7 CM".
// Picking a design writes this into the line's Bahan, and a Bahan that reads
// exactly like this is known to be that design (for its photo and price).
export const designLabel = (d: Pick<SupplierDesign, 'name' | 'placement' | 'size'>) =>
  [d.name, d.placement, d.size].map(v => (v ?? '').trim()).filter(Boolean).join(' - ').toUpperCase()

/** The supplier's design this Bahan names, if any. */
export function designFromText(designs: SupplierDesign[], supplierId: number | null | undefined, text: string): SupplierDesign | undefined {
  if (!supplierId) return undefined
  const upper = text.trim().toUpperCase()
  return designs.find(d => d.supplier_id === supplierId && designLabel(d) === upper)
}

/** One supplier's designs, by name. */
export const designsFor = (designs: SupplierDesign[], supplierId: number | null | undefined) =>
  supplierId ? designs.filter(d => d.supplier_id === supplierId).sort((a, b) => designLabel(a).localeCompare(designLabel(b))) : []

/** Suppliers whose catalogue is designs, not materials and colours. */
export const DESIGN_CATEGORIES = new Set(['embroidery', 'sablon'])
