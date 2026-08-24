import type { SupplierCategory } from '@/types'

// SupplierCategory values are snake_case wire values (e.g.
// "merchandise_supplier") — this is the short display label shown next to
// a supplier's name everywhere it shows up (dropdown options, group
// headers, badges, the Supplier column).
export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  sablon: 'Sablon',
  embroidery: 'Embroidery',
  merchandise_supplier: 'Merchandise',
  uniform_supplier: 'Uniform',
  general_supplier: 'General',
}

// Fixed per-category color for the small dot shown next to a supplier's
// name — deliberately not applied to the bars themselves (see the comment
// in SpendBars.tsx for why). Picked for reasonable contrast on the dark
// navy-900 card and to vary in both hue and lightness, not hue alone, so
// they stay distinguishable for colorblind readers too.
export const CATEGORY_COLORS: Record<SupplierCategory, string> = {
  sablon: '#fbbf24',               // amber
  embroidery: '#2dd4bf',           // teal
  merchandise_supplier: '#a78bfa', // violet
  uniform_supplier: '#fb7185',     // rose
  general_supplier: '#94a3b8',     // slate (neutral "other" bucket)
}