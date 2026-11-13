import type { SupplierCategory } from '@/types'

import i18n from 'i18next'

// Short display labels for the supplier category values, in the app's
// language. Read through getters (off the i18next singleton, like
// monthLabel), so every place that already uses CATEGORY_LABELS[...] or
// Object.entries(CATEGORY_LABELS) follows the language toggle unchanged.
const LABELS: Record<'en' | 'id', Record<SupplierCategory, string>> = {
  en: { sablon: 'Sablon', embroidery: 'Embroidery', merchandise_supplier: 'Merchandise', uniform_supplier: 'Uniform', general_supplier: 'General' },
  id: { sablon: 'Sablon', embroidery: 'Bordir', merchandise_supplier: 'Merchandise', uniform_supplier: 'Seragam', general_supplier: 'Umum' },
}
export const CATEGORY_LABELS = Object.defineProperties({}, Object.fromEntries(
  (Object.keys(LABELS.en) as SupplierCategory[]).map(k => [k, {
    enumerable: true,
    get: () => LABELS[i18n.resolvedLanguage?.startsWith('id') ? 'id' : 'en'][k],
  }]),
)) as Record<SupplierCategory, string>

// A dot color per category, varying in lightness as well as hue so they stay
// distinguishable for colorblind readers.
export const CATEGORY_COLORS: Record<SupplierCategory, string> = {
  sablon: '#fbbf24',               // amber
  embroidery: '#2dd4bf',           // teal
  merchandise_supplier: '#a78bfa', // violet
  uniform_supplier: '#fb7185',     // rose
  general_supplier: '#94a3b8',     // slate (neutral "other" bucket)
}