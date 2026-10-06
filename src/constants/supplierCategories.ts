import type { SupplierCategory } from '@/types'

// Short display labels for the supplier category values.
export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  sablon: 'Sablon',
  embroidery: 'Embroidery',
  merchandise_supplier: 'Merchandise',
  uniform_supplier: 'Uniform',
  general_supplier: 'General',
}

// A dot color per category, varying in lightness as well as hue so they stay
// distinguishable for colorblind readers.
export const CATEGORY_COLORS: Record<SupplierCategory, string> = {
  sablon: '#fbbf24',               // amber
  embroidery: '#2dd4bf',           // teal
  merchandise_supplier: '#a78bfa', // violet
  uniform_supplier: '#fb7185',     // rose
  general_supplier: '#94a3b8',     // slate (neutral "other" bucket)
}